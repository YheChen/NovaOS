import { describe, it, expect } from 'vitest';
import { createSimulationClock, asSimTime, type ProcessId } from '@novaos/shared';
import {
  createCpu,
  encodeInstruction,
  Opcode,
  INITIAL_FLAGS,
  type RegisterFileSnapshot,
  type OutputSink,
} from '@novaos/cpu';
import { createMemory } from '@novaos/memory';
import {
  createFifoScheduler,
  createRoundRobinScheduler,
  type Scheduler,
  type SchedulableProcess,
} from '@novaos/scheduler';
import { createTestEventBus } from '@novaos/testing';
import {
  createKernel,
  createPidAllocator,
  KERNEL_PID,
  canTransition,
  isTerminal,
  Syscall,
} from './index';

function buildCode(
  words: Array<{ opcode: number; a?: number; b?: number; c?: number }>,
): Uint8Array {
  const code = new Uint8Array(words.length * 4);
  words.forEach((w, i) => {
    const word = encodeInstruction(w.opcode, w.a ?? 0, w.b ?? 0, w.c ?? 0);
    const offset = i * 4;
    code[offset] = word & 0xff;
    code[offset + 1] = (word >>> 8) & 0xff;
    code[offset + 2] = (word >>> 16) & 0xff;
    code[offset + 3] = (word >>> 24) & 0xff;
  });
  return code;
}

function registers(overrides: Partial<RegisterFileSnapshot> = {}): RegisterFileSnapshot {
  return {
    r0: 0,
    r1: 0,
    r2: 0,
    r3: 0,
    r4: 0,
    r5: 0,
    r6: 0,
    r7: 0,
    pc: 0,
    sp: 0,
    bp: 0,
    ir: 0,
    flags: { ...INITIAL_FLAGS },
    ...overrides,
  };
}

function setup(scheduler: Scheduler = createFifoScheduler()) {
  const { bus, recorder } = createTestEventBus();
  const clock = createSimulationClock();
  const memory = createMemory(8192);
  const cpu = createCpu();
  const out: string[] = [];
  const output: OutputSink = { write: (text) => out.push(text) };
  const registerPort = {
    capture: () => cpu.getRegisters(),
    load: (snapshot: RegisterFileSnapshot) => cpu.restoreSnapshot({ registers: snapshot }),
  };
  const kernel = createKernel({ bus, clock, memory, scheduler, registerPort, output });
  return { kernel, recorder, clock, out, memory };
}

const HELLO = () => buildCode([{ opcode: Opcode.HALT }]);

describe('PID allocator', () => {
  it('reserves PID 0 for the kernel and allocates monotonically from 1', () => {
    expect(KERNEL_PID).toBe(0);
    const alloc = createPidAllocator(1);
    expect([alloc.next(), alloc.next(), alloc.next()]).toEqual([1, 2, 3]);
  });
});

describe('process-state transitions', () => {
  it('permits the legal lifecycle and rejects illegal jumps', () => {
    expect(canTransition('new', 'ready')).toBe(true);
    expect(canTransition('ready', 'running')).toBe(true);
    expect(canTransition('running', 'terminated')).toBe(true);
    expect(canTransition('running', 'ready')).toBe(true);
    expect(canTransition('new', 'running')).toBe(false);
    expect(canTransition('terminated', 'ready')).toBe(false);
    expect(isTerminal('terminated')).toBe(true);
  });
});

describe('kernel boot', () => {
  it('boots deterministically and parks init + shell as placeholders', () => {
    const { kernel, recorder } = setup();
    const result = kernel.boot();
    expect(result.ok).toBe(true);
    expect(kernel.getStatus()).toBe('ready');

    const table = kernel.getProcessTable();
    expect(table.processes.map((p) => p.name)).toEqual(['init', 'shell']);
    expect(table.processes.every((p) => p.state === 'new')).toBe(true);

    const types = recorder.getEvents().map((e) => e.type);
    expect(types[0]).toBe('kernel.boot.started');
    expect(types).toContain('scheduler.initialized');
    expect(types.filter((t) => t === 'kernel.boot.stage.completed')).toHaveLength(6);
    expect(types[types.length - 1]).toBe('kernel.boot.completed');
  });

  it('refuses to boot twice', () => {
    const { kernel } = setup();
    kernel.boot();
    expect(kernel.boot().ok).toBe(false);
  });
});

describe('process creation', () => {
  it('admits a user process to the scheduler in the ready state', () => {
    const { kernel, recorder } = setup();
    kernel.boot();
    const created = kernel.createProcess({ name: 'hello', image: { code: HELLO() }, admit: true });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const pcb = kernel.getProcess(created.value);
    expect(pcb?.state).toBe('ready');
    expect(pcb?.memoryMap.code).not.toBeNull();

    const types = recorder.getEvents().map((e) => e.type);
    expect(types).toContain('kernel.process.created');
    expect(types).toContain('scheduler.process.enqueued');
  });
});

describe('syscall dispatch', () => {
  it('prints the value in R0 and returns 0', () => {
    const { kernel, recorder, out } = setup();
    kernel.boot();
    kernel.createProcess({ name: 'hello', image: { code: HELLO() }, admit: true });
    kernel.dispatch();

    const result = kernel.handleSyscall({
      id: 0,
      registers: registers({ r0: 42 }),
      tick: asSimTime(0),
    });
    expect(result).toEqual({ kind: 'return', returnValue: 0 });
    expect(out.join('')).toBe('42\n');

    const types = recorder.getEvents().map((e) => e.type);
    expect(types).toContain('kernel.syscall.invoked');
    expect(types).toContain('kernel.process.output');
    expect(types).toContain('kernel.syscall.completed');
  });

  it('maps exit to a process exit outcome', () => {
    const { kernel } = setup();
    kernel.boot();
    kernel.createProcess({ name: 'hello', image: { code: HELLO() }, admit: true });
    kernel.dispatch();
    expect(
      kernel.handleSyscall({ id: 4, registers: registers({ r0: 7 }), tick: asSimTime(0) }),
    ).toEqual({
      kind: 'exit',
      code: 7,
    });
  });

  it('faults on an unknown syscall', () => {
    const { kernel } = setup();
    kernel.boot();
    kernel.createProcess({ name: 'hello', image: { code: HELLO() }, admit: true });
    kernel.dispatch();
    const result = kernel.handleSyscall({ id: 99, registers: registers(), tick: asSimTime(0) });
    expect(result.kind).toBe('fault');
  });
});

describe('context switching', () => {
  it('saves the running process and loads the next on a timer interrupt', () => {
    const { kernel, recorder } = setup(createRoundRobinScheduler({ quantumTicks: 2 }));
    kernel.boot();
    const a = kernel.createProcess({ name: 'a', image: { code: HELLO() }, admit: true });
    const b = kernel.createProcess({ name: 'b', image: { code: HELLO() }, admit: true });
    if (!a.ok || !b.ok) throw new Error('create failed');

    const first = kernel.dispatch();
    expect(first).toBe(a.value);
    expect(kernel.getProcess(a.value)?.state).toBe('running');

    kernel.handleTimerInterrupt();
    expect(kernel.getCurrentPid()).toBe(b.value);
    expect(kernel.getProcess(a.value)?.state).toBe('ready');
    expect(kernel.getProcess(b.value)?.state).toBe('running');

    const types = recorder.getEvents().map((e) => e.type);
    expect(types).toContain('kernel.interrupt.raised');
    expect(types).toContain('kernel.context.switch');
    expect(types).toContain('kernel.interrupt.handled');
  });
});

/** A minimal scheduler that records every process it is handed, for wiring tests. */
function spyScheduler(seen: SchedulableProcess[]): Scheduler {
  let queue: SchedulableProcess[] = [];
  const contains = (pid: ProcessId): boolean => queue.some((p) => p.pid === pid);
  return {
    id: 'srtf',
    name: 'spy',
    quantumTicks: 1,
    enqueue(process) {
      seen.push(process);
      if (!contains(process.pid)) queue.push(process);
    },
    remove(pid) {
      queue = queue.filter((p) => p.pid !== pid);
    },
    pickNext() {
      const next = queue.shift();
      return next ? next.pid : null;
    },
    requeue(process) {
      seen.push(process);
      if (!contains(process.pid)) queue.push(process);
    },
    has: contains,
    size: () => queue.length,
    snapshot() {
      return {
        schedulerId: 'srtf',
        algorithmName: 'spy',
        quantumTicks: 1,
        readyQueue: queue.map((p) => p.pid),
        config: {},
      };
    },
    restore() {},
  };
}

describe('blocking: sleep and yield', () => {
  it('sleep descheduls the process until its wake tick, then makes it ready', () => {
    const { kernel } = setup();
    kernel.boot();
    const created = kernel.createProcess({ name: 'p', image: { code: HELLO() } });
    if (!created.ok) throw new Error('create failed');
    const pid = created.value;
    expect(kernel.dispatch()).toBe(pid);

    const result = kernel.handleSyscall({
      id: Syscall.SLEEP,
      registers: registers({ r0: 5 }),
      tick: asSimTime(0),
    });
    expect(result.kind).toBe('block');
    kernel.commitDeschedule();

    expect(kernel.getProcess(pid)?.state).toBe('sleeping');
    expect(kernel.getCurrentPid()).toBeNull();
    expect(kernel.hasSleepers()).toBe(true);
    expect(kernel.nextWakeTick()).toBe(5);

    kernel.wakeSleepers(4); // not due yet
    expect(kernel.getProcess(pid)?.state).toBe('sleeping');
    kernel.wakeSleepers(5); // due
    expect(kernel.getProcess(pid)?.state).toBe('ready');
    expect(kernel.hasSleepers()).toBe(false);
  });

  it('yield returns the running process to the ready queue behind its peers', () => {
    const { kernel } = setup();
    kernel.boot();
    const a = kernel.createProcess({ name: 'a', image: { code: HELLO() } });
    const b = kernel.createProcess({ name: 'b', image: { code: HELLO() } });
    if (!a.ok || !b.ok) throw new Error('create failed');
    expect(kernel.dispatch()).toBe(a.value);

    const result = kernel.handleSyscall({
      id: Syscall.YIELD,
      registers: registers(),
      tick: asSimTime(0),
    });
    expect(result.kind).toBe('yield');
    kernel.commitDeschedule();

    expect(kernel.getProcess(a.value)?.state).toBe('ready');
    expect(kernel.getCurrentPid()).toBeNull();
    expect(kernel.dispatch()).toBe(b.value); // b runs; a was requeued behind it
  });
});

describe('SJF/SRTF burst-estimate wiring', () => {
  it('hands the scheduler remaining burst = estimate − cpuTicksUsed', () => {
    const seen: SchedulableProcess[] = [];
    const { kernel } = setup(spyScheduler(seen));
    kernel.boot();
    const created = kernel.createProcess({
      name: 'job',
      image: { code: HELLO() },
      estimatedBurst: 10,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const pid = created.value;

    // At admission cpuTicksUsed === 0, so the scheduler sees the full estimate.
    expect(seen.at(-1)?.estimatedBurst).toBe(10);

    // Run the job, burn 4 ticks, then force a requeue via the timer interrupt.
    kernel.dispatch();
    const pcb = kernel.getProcess(pid);
    expect(pcb).toBeDefined();
    if (pcb) pcb.accounting.cpuTicksUsed = 4;
    kernel.handleTimerInterrupt();

    // The requeue recomputes remaining burst: 10 − 4 = 6.
    expect(seen.some((p) => p.estimatedBurst === 6)).toBe(true);
  });

  it('omits the estimate entirely when none was supplied', () => {
    const seen: SchedulableProcess[] = [];
    const { kernel } = setup(spyScheduler(seen));
    kernel.boot();
    kernel.createProcess({ name: 'job', image: { code: HELLO() } });
    expect(seen.at(-1)?.estimatedBurst).toBeUndefined();
  });
});
