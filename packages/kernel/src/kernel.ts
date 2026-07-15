import {
  ok,
  err,
  novaError,
  asAddress,
  createSeededRandom,
  type Result,
  type ProcessId,
  type DeterministicRandom,
  type SimulationClock,
} from '@novaos/shared';
import type { EventBus } from '@novaos/events';
import {
  INITIAL_FLAGS,
  type RegisterFileSnapshot,
  type OutputSink,
  type SyscallTrapRequest,
  type SyscallTrapResult,
} from '@novaos/cpu';
import type { Memory, MemorySegment } from '@novaos/memory';
import type { Scheduler, SchedulableProcess, SchedulingContext } from '@novaos/scheduler';
import { canTransition, type ProcessState } from './process-state';
import {
  emptyMemoryMap,
  type ProcessControlBlock,
  type ProcessMemoryMap,
  type ProcessFault,
  type ExitReason,
} from './pcb';
import { createPidAllocator } from './pid';
import { SYSCALL_HANDLERS, syscallName } from './syscalls';
import { createHeap, type Heap, type HeapBlock } from './heap';
import type { RegisterPort } from './register-port';
import {
  type KernelStatus,
  type ProcessTableSnapshot,
  type KernelSnapshot,
  summarize,
} from './snapshots';
import { kernelFault, type KernelFault } from './faults';
import * as events from './events';
import type { ContextSwitchReason } from './events';

export interface ProcessImage {
  readonly code: Uint8Array;
  readonly entryOffset?: number;
}

export interface CreateProcessSpec {
  readonly name: string;
  /** `null`/absent => a placeholder process with no executable (stays `new`). */
  readonly image?: ProcessImage | null;
  readonly parentPid?: ProcessId | null;
  readonly priority?: number;
  /** Total estimated CPU burst in ticks (SJF/SRTF ranking hint; optional). */
  readonly estimatedBurst?: number;
  /** Admit to the scheduler (defaults to true when an image is provided). */
  readonly admit?: boolean;
  readonly segments?: { dataBytes?: number; heapBytes?: number; stackBytes?: number };
}

export interface KernelConfig {
  readonly kernelReservedBytes?: number;
  readonly defaultDataBytes?: number;
  readonly defaultHeapBytes?: number;
  readonly defaultStackBytes?: number;
}

export interface KernelDeps {
  readonly bus: EventBus;
  readonly clock: SimulationClock;
  readonly memory: Memory;
  readonly scheduler: Scheduler;
  readonly registerPort: RegisterPort;
  readonly output: OutputSink;
  readonly random?: DeterministicRandom;
  readonly config?: KernelConfig;
}

export interface Kernel {
  boot(): Result<void>;
  createProcess(spec: CreateProcessSpec): Result<ProcessId>;
  dispatch(): ProcessId | null;
  handleSyscall(request: SyscallTrapRequest): SyscallTrapResult;
  handleTimerInterrupt(): void;
  recordInstruction(cycles: number): void;
  shouldPreempt(): boolean;
  terminateCurrent(reason: ExitReason, exitCode: number): void;
  faultCurrent(fault: ProcessFault): void;
  /** Apply a pending block/yield decided during the last syscall (deschedules current). */
  commitDeschedule(): void;
  /** Move any sleeping process whose wake tick has arrived back to the ready queue. */
  wakeSleepers(now: number): void;
  /** The earliest sleeper wake tick, or `null` when nothing is sleeping. */
  nextWakeTick(): number | null;
  hasSleepers(): boolean;
  hasRunnable(): boolean;
  /** Base address of the shared-memory region (for tests / the concurrency demo). */
  getSharedBase(): number;
  getCurrentPid(): ProcessId | null;
  getStatus(): KernelStatus;
  getProcess(pid: ProcessId): ProcessControlBlock | undefined;
  listProcesses(): ProcessControlBlock[];
  getProcessTable(): ProcessTableSnapshot;
  getSchedulerSnapshot(): ReturnType<Scheduler['snapshot']>;
  getMemoryMap(): ReturnType<Memory['memoryMap']>;
  /** The process heap's allocated/free blocks, for the heap visualizer. */
  getHeapBlocks(pid: ProcessId): HeapBlock[];
  getSnapshot(): KernelSnapshot;
}

const BOOT_STAGES = ['cpu', 'memory', 'scheduler', 'syscalls', 'init', 'shell'] as const;

/** Bytes of shared memory reserved at boot (addressable via the `shared` syscall). */
const SHARED_REGION_BYTES = 64;

function initialRegisters(pc: number, sp: number): RegisterFileSnapshot {
  return {
    r0: 0,
    r1: 0,
    r2: 0,
    r3: 0,
    r4: 0,
    r5: 0,
    r6: 0,
    r7: 0,
    pc,
    sp,
    bp: sp,
    ir: 0,
    flags: { ...INITIAL_FLAGS },
  };
}

export function createKernel(deps: KernelDeps): Kernel {
  const { bus, clock, memory, scheduler, registerPort, output } = deps;
  const random = deps.random ?? createSeededRandom(1);
  const config = deps.config ?? {};
  const kernelReservedBytes = config.kernelReservedBytes ?? 1024;
  const defaultDataBytes = config.defaultDataBytes ?? 16;
  const defaultHeapBytes = config.defaultHeapBytes ?? 256;
  const defaultStackBytes = config.defaultStackBytes ?? 256;

  const table = new Map<ProcessId, ProcessControlBlock>();
  const pidAllocator = createPidAllocator(1);
  let arrivalCounter = 0;
  let currentPid: ProcessId | null = null;
  let status: KernelStatus = 'created';
  let lastFault: KernelFault | null = null;

  // Sleeping processes keyed by their wake tick (the timed wait queue).
  const sleepers = new Map<ProcessId, number>();
  // Mutexes by id, and the FIFO of processes blocked on each wait channel.
  const mutexes = new Map<number, { owner: ProcessId | null }>();
  const channelWaiters = new Map<number, ProcessId[]>();
  // Message-passing pipes: a FIFO of buffered words per pipe id.
  const pipes = new Map<number, number[]>();
  // Base address of the shared-memory region (set at boot).
  let sharedBase = 0;
  // A block/yield decided during a syscall, committed once the CPU has advanced.
  let pendingDeschedule:
    | { kind: 'sleep'; wakeAtTick: number }
    | { kind: 'yield' }
    | { kind: 'block'; channel: number }
    | null = null;

  // Per-process heap allocator, created lazily from the process heap segment.
  const heaps = new Map<ProcessId, Heap>();
  const heapFor = (pid: ProcessId): Heap | undefined => {
    const existing = heaps.get(pid);
    if (existing) return existing;
    const seg = table.get(pid)?.memoryMap.heap;
    if (!seg) return undefined;
    const heap = createHeap(seg.base, seg.size);
    heaps.set(pid, heap);
    return heap;
  };

  const now = () => clock.now();
  const schedContext = (): SchedulingContext => ({ currentPid, tick: now(), random });

  // --- Mutexes + wait channels --------------------------------------------
  function getOrCreateMutex(id: number): { owner: ProcessId | null } {
    let m = mutexes.get(id);
    if (!m) {
      m = { owner: null };
      mutexes.set(id, m);
    }
    return m;
  }
  /** Acquire mutex `id` for `pid`; false means it is held elsewhere (must block). */
  function acquireLockFor(id: number, pid: ProcessId): boolean {
    const m = getOrCreateMutex(id);
    if (m.owner === null) {
      m.owner = pid;
      return true;
    }
    return m.owner === pid; // already ours (re-entrant)
  }
  /** Hand mutex `id` to the next FIFO waiter, or free it when none wait. */
  function grantToNextWaiter(id: number, m: { owner: ProcessId | null }): void {
    const q = channelWaiters.get(id);
    const next = q && q.length > 0 ? q.shift() : undefined;
    if (next === undefined) {
      m.owner = null;
      return;
    }
    m.owner = next;
    const pcb = table.get(next);
    if (pcb) {
      transition(pcb, 'ready', 'lock-granted');
      scheduler.enqueue(schedulableOf(pcb));
      bus.publish(events.schedulerEnqueuedEvent(now(), next));
    }
  }
  function releaseLockFor(id: number, pid: ProcessId): void {
    const m = mutexes.get(id);
    if (!m || m.owner !== pid) return; // releasing a lock you do not hold is a no-op
    grantToNextWaiter(id, m);
  }

  // --- Pipes (message passing) --------------------------------------------
  // Pipe wait channels live in a separate numeric range so they never collide
  // with mutex channels (which are keyed by raw mutex id).
  const PIPE_CHANNEL_OFFSET = 1_000_000;
  function pipeReceive(id: number): { value: number } | { channel: number } {
    const buffer = pipes.get(id);
    if (buffer && buffer.length > 0) return { value: buffer.shift() as number };
    return { channel: PIPE_CHANNEL_OFFSET + id };
  }
  function pipeSend(id: number, value: number): void {
    const word = value >>> 0;
    const q = channelWaiters.get(PIPE_CHANNEL_OFFSET + id);
    const receiver = q && q.length > 0 ? q.shift() : undefined;
    if (receiver !== undefined) {
      // Rendezvous: hand the value straight to the woken receiver's R0.
      const pcb = table.get(receiver);
      if (pcb) {
        pcb.registers = { ...pcb.registers, r0: word };
        transition(pcb, 'ready', 'pipe-received');
        scheduler.enqueue(schedulableOf(pcb));
        bus.publish(events.schedulerEnqueuedEvent(now(), receiver));
        return;
      }
    }
    const buffer = pipes.get(id) ?? [];
    buffer.push(word);
    pipes.set(id, buffer);
  }

  function raiseKernelFault(
    code: string,
    message: string,
    severity: 'recoverable' | 'fatal',
  ): void {
    lastFault = kernelFault(code, message, severity, now());
    bus.publish(events.kernelFaultEvent(now(), code, message, severity));
    if (severity === 'fatal') status = 'faulted';
  }

  function transition(pcb: ProcessControlBlock, next: ProcessState, reason: string): void {
    const previous = pcb.state;
    if (previous === next) return;
    if (!canTransition(previous, next)) {
      raiseKernelFault(
        'kernel/invalid-transition',
        `Invalid process transition ${previous} -> ${next} for PID ${pcb.pid}.`,
        'recoverable',
      );
    }
    pcb.state = next;
    pcb.updatedAtTick = now();
    bus.publish(events.processStateChangedEvent(now(), pcb.pid, previous, next, reason));
  }

  function schedulableOf(pcb: ProcessControlBlock): SchedulableProcess {
    const total = pcb.scheduling.estimatedBurst;
    return {
      pid: pcb.pid,
      priority: pcb.priority,
      arrivalSequence: pcb.scheduling.arrivalSequence,
      // SJF/SRTF want *remaining* burst: total estimate minus ticks already run.
      // Recomputed on every enqueue/requeue, so SRTF sees the time shrink.
      ...(total !== undefined
        ? { estimatedBurst: Math.max(1, total - pcb.accounting.cpuTicksUsed) }
        : {}),
    };
  }

  function freeProcessMemory(pcb: ProcessControlBlock): void {
    const segments: Array<MemorySegment | null> = [
      pcb.memoryMap.code,
      pcb.memoryMap.data,
      pcb.memoryMap.heap,
      pcb.memoryMap.stack,
    ];
    for (const segment of segments) {
      if (segment) memory.release(segment.id);
    }
  }

  function dispatchInternal(reason: ContextSwitchReason): ProcessId | null {
    const previous = currentPid;
    const pid = scheduler.pickNext(schedContext());
    if (pid === null) return null;
    bus.publish(events.schedulerPickedEvent(now(), pid));

    const pcb = table.get(pid);
    if (!pcb) {
      raiseKernelFault('kernel/missing-pcb', `Scheduler picked PID ${pid} with no PCB.`, 'fatal');
      return null;
    }

    registerPort.load(pcb.registers);
    transition(pcb, 'running', 'dispatched');
    pcb.scheduling.lastScheduledAtTick = now();
    pcb.scheduling.quantumRemaining = scheduler.quantumTicks ?? Number.POSITIVE_INFINITY;
    pcb.accounting.contextSwitches += 1;
    currentPid = pid;
    status = 'running';
    bus.publish(events.contextSwitchEvent(now(), previous, pid, reason));
    return pid;
  }

  function reserveProcessSegments(
    pid: ProcessId,
    image: ProcessImage,
    spec: CreateProcessSpec,
  ): Result<ProcessMemoryMap> {
    const reserved: MemorySegment[] = [];
    const reserve = (
      kind: 'code' | 'data' | 'heap' | 'stack',
      size: number,
    ): MemorySegment | null => {
      const result = memory.reserve({ ownerPid: pid, kind, size, label: `${kind}#${pid}` });
      if (!result.ok) return null;
      reserved.push(result.value);
      return result.value;
    };

    const code = reserve('code', Math.max(4, image.code.length));
    const data = reserve('data', spec.segments?.dataBytes ?? defaultDataBytes);
    const heap = reserve('heap', spec.segments?.heapBytes ?? defaultHeapBytes);
    const stack = reserve('stack', spec.segments?.stackBytes ?? defaultStackBytes);

    if (!code || !data || !heap || !stack) {
      for (const segment of reserved) memory.release(segment.id);
      return err(
        novaError({
          code: 'kernel/out-of-memory',
          severity: 'recoverable',
          message: `Not enough memory to create process "${spec.name}".`,
        }),
      );
    }

    const loaded = memory.load(asAddress(code.base), image.code);
    if (!loaded.ok) {
      for (const segment of reserved) memory.release(segment.id);
      return loaded;
    }

    return ok({ code, data, heap, stack });
  }

  function createProcess(spec: CreateProcessSpec): Result<ProcessId> {
    const pid = pidAllocator.next();
    const arrivalSequence = arrivalCounter;
    arrivalCounter += 1;

    let memoryMap: ProcessMemoryMap = emptyMemoryMap();
    let registers = initialRegisters(0, 0);

    if (spec.image) {
      const segments = reserveProcessSegments(pid, spec.image, spec);
      if (!segments.ok) return segments;
      memoryMap = segments.value;
      const entry = (memoryMap.code?.base ?? 0) + (spec.image.entryOffset ?? 0);
      const stackTop = memoryMap.stack ? memoryMap.stack.base + memoryMap.stack.size : 0;
      registers = initialRegisters(entry, stackTop);
    }

    const pcb: ProcessControlBlock = {
      pid,
      parentPid: spec.parentPid ?? null,
      name: spec.name,
      state: 'new',
      priority: spec.priority ?? 0,
      registers,
      memoryMap,
      scheduling: {
        quantumRemaining: 0,
        lastScheduledAtTick: null,
        arrivalSequence,
        ...(spec.estimatedBurst !== undefined ? { estimatedBurst: spec.estimatedBurst } : {}),
      },
      accounting: {
        cpuTicksUsed: 0,
        instructionsExecuted: 0,
        syscallsInvoked: 0,
        contextSwitches: 0,
      },
      createdAtTick: now(),
      updatedAtTick: now(),
      exitCode: null,
      fault: null,
    };
    table.set(pid, pcb);
    bus.publish(events.processCreatedEvent(now(), pid, pcb.name, pcb.parentPid));

    const admit = spec.admit ?? spec.image != null;
    if (admit) {
      transition(pcb, 'ready', 'admitted');
      scheduler.enqueue(schedulableOf(pcb));
      bus.publish(events.schedulerEnqueuedEvent(now(), pid));
    }

    return ok(pid);
  }

  function terminateProcess(pid: ProcessId, reason: ExitReason, exitCode: number | null): void {
    const pcb = table.get(pid);
    if (!pcb) return;
    sleepers.delete(pid);
    // Release any mutexes this process holds (handing them to a waiter), and
    // drop it from any wait channel it was blocked on.
    for (const [id, m] of mutexes) {
      if (m.owner === pid) grantToNextWaiter(id, m);
    }
    for (const q of channelWaiters.values()) {
      const index = q.indexOf(pid);
      if (index >= 0) q.splice(index, 1);
    }
    if (pid === currentPid) pcb.registers = registerPort.capture();
    if (pcb.state !== 'terminated') transition(pcb, 'terminated', reason);
    pcb.exitCode = exitCode;
    if (scheduler.has(pid)) {
      scheduler.remove(pid);
      bus.publish(events.schedulerRemovedEvent(now(), pid));
    }
    freeProcessMemory(pcb);
    bus.publish(events.processTerminatedEvent(now(), pid, exitCode, reason));
    if (pid === currentPid) {
      currentPid = null;
      status = 'ready';
    }
  }

  function writeOutput(text: string): void {
    output.write(text);
  }
  function emitOutput(pid: ProcessId, value: number, text: string): void {
    bus.publish(events.processOutputEvent(now(), pid, value, text));
  }

  return {
    boot() {
      if (status !== 'created') {
        return err(
          novaError({
            code: 'kernel/already-booted',
            severity: 'recoverable',
            message: 'Kernel has already booted.',
          }),
        );
      }
      status = 'booting';
      bus.publish(events.bootStartedEvent(now()));

      let initPid: ProcessId | null = null;
      BOOT_STAGES.forEach((stage, index) => {
        if (stage === 'memory') {
          memory.reserve({
            ownerPid: null,
            kind: 'kernel',
            size: kernelReservedBytes,
            label: 'kernel',
          });
          // A small shared-memory region every process can peek/poke via shared(i).
          const sharedSeg = memory.reserve({
            ownerPid: null,
            kind: 'data',
            size: SHARED_REGION_BYTES,
            label: 'shared',
          });
          if (sharedSeg.ok) sharedBase = sharedSeg.value.base;
        } else if (stage === 'scheduler') {
          bus.publish(
            events.schedulerInitializedEvent(
              now(),
              scheduler.id,
              scheduler.name,
              scheduler.quantumTicks,
            ),
          );
        } else if (stage === 'init') {
          const created = createProcess({ name: 'init', image: null, admit: false });
          if (created.ok) initPid = created.value;
        } else if (stage === 'shell') {
          createProcess({ name: 'shell', image: null, admit: false, parentPid: initPid });
        }
        bus.publish(events.bootStageCompletedEvent(now(), stage, index));
      });

      status = 'ready';
      bus.publish(events.bootCompletedEvent(now()));
      return ok(undefined);
    },

    createProcess,

    dispatch() {
      if (currentPid !== null) return currentPid;
      return dispatchInternal('dispatch');
    },

    handleSyscall(request) {
      const pid = currentPid;
      if (pid === null) {
        return {
          kind: 'fault',
          code: 'kernel/no-current-process',
          message: 'SYSCALL with no running process.',
        };
      }
      const pcb = table.get(pid);
      const name = syscallName(request.id);
      const args = [request.registers.r0, request.registers.r1, request.registers.r2];
      bus.publish(events.syscallInvokedEvent(now(), pid, request.id, name, args));
      if (pcb) pcb.accounting.syscallsInvoked += 1;

      const handler = SYSCALL_HANDLERS[request.id];
      if (!handler) {
        const message = `Unknown syscall ${request.id}.`;
        bus.publish(events.syscallFailedEvent(now(), pid, request.id, name, message));
        return { kind: 'fault', code: 'kernel/unknown-syscall', message };
      }

      const outcome = handler({
        pid,
        registers: request.registers,
        tick: request.tick,
        writeOutput,
        emitOutput: (value, text) => emitOutput(pid, value, text),
        heapAlloc: (size) => heapFor(pid)?.malloc(size) ?? 0,
        heapFree: (address) => heapFor(pid)?.free(address) ?? false,
        acquireLock: (id) => acquireLockFor(id, pid),
        releaseLock: (id) => releaseLockFor(id, pid),
        sharedAddress: (index) => sharedBase + index * 4,
        pipeSend: (id, value) => pipeSend(id, value),
        pipeReceive: (id) => pipeReceive(id),
      });

      if (outcome.kind === 'return') {
        bus.publish(events.syscallCompletedEvent(now(), pid, request.id, name, outcome.value));
        return { kind: 'return', returnValue: outcome.value };
      }
      if (outcome.kind === 'sleep') {
        bus.publish(events.syscallCompletedEvent(now(), pid, request.id, name, 0));
        pendingDeschedule = { kind: 'sleep', wakeAtTick: outcome.wakeAtTick };
        return { kind: 'block', returnValue: outcome.returnValue };
      }
      if (outcome.kind === 'yield') {
        bus.publish(events.syscallCompletedEvent(now(), pid, request.id, name, 0));
        pendingDeschedule = { kind: 'yield' };
        return { kind: 'yield' };
      }
      if (outcome.kind === 'block-on-channel') {
        bus.publish(
          events.syscallCompletedEvent(now(), pid, request.id, name, outcome.returnValue),
        );
        pendingDeschedule = { kind: 'block', channel: outcome.channel };
        return { kind: 'block', returnValue: outcome.returnValue };
      }
      bus.publish(events.syscallCompletedEvent(now(), pid, request.id, name, outcome.code));
      return { kind: 'exit', code: outcome.code };
    },

    handleTimerInterrupt() {
      if (currentPid === null) return;
      const cur = table.get(currentPid);
      if (!cur) return;
      bus.publish(events.interruptRaisedEvent(now(), 'timer', 'timer'));
      cur.registers = registerPort.capture();
      transition(cur, 'ready', 'timer-quantum-expired');
      scheduler.requeue(schedulableOf(cur), schedContext());
      bus.publish(events.schedulerEnqueuedEvent(now(), cur.pid));
      currentPid = null;
      bus.publish(events.interruptHandledEvent(now(), 'timer', 'timer'));
      dispatchInternal('timer-quantum-expired');
    },

    recordInstruction(cycles) {
      if (currentPid === null) return;
      const cur = table.get(currentPid);
      if (!cur) return;
      cur.accounting.instructionsExecuted += 1;
      cur.accounting.cpuTicksUsed += cycles;
      if (Number.isFinite(cur.scheduling.quantumRemaining)) {
        cur.scheduling.quantumRemaining -= cycles;
      }
    },

    shouldPreempt() {
      if (currentPid === null) return false;
      if (scheduler.quantumTicks === null) return false;
      if (scheduler.size() === 0) return false;
      const cur = table.get(currentPid);
      return cur ? cur.scheduling.quantumRemaining <= 0 : false;
    },

    terminateCurrent(reason, exitCode) {
      if (currentPid !== null) terminateProcess(currentPid, reason, exitCode);
    },

    faultCurrent(fault) {
      if (currentPid === null) return;
      const pcb = table.get(currentPid);
      if (!pcb) return;
      pcb.registers = registerPort.capture();
      transition(pcb, 'faulted', 'process-faulted');
      pcb.fault = fault;
      terminateProcess(currentPid, 'faulted', null);
    },

    commitDeschedule() {
      const pending = pendingDeschedule;
      pendingDeschedule = null;
      if (!pending || currentPid === null) return;
      const pcb = table.get(currentPid);
      if (!pcb) {
        currentPid = null;
        return;
      }
      // Capture the CPU state *after* the syscall advanced PC / wrote R0, so the
      // process resumes on the instruction following the blocking syscall.
      pcb.registers = registerPort.capture();
      if (pending.kind === 'yield') {
        transition(pcb, 'ready', 'yielded');
        scheduler.requeue(schedulableOf(pcb), schedContext());
        bus.publish(events.schedulerEnqueuedEvent(now(), pcb.pid));
      } else if (pending.kind === 'sleep') {
        transition(pcb, 'sleeping', 'sleep');
        sleepers.set(pcb.pid, pending.wakeAtTick);
      } else {
        transition(pcb, 'blocked', 'blocked-on-channel');
        const q = channelWaiters.get(pending.channel) ?? [];
        q.push(pcb.pid);
        channelWaiters.set(pending.channel, q);
      }
      currentPid = null;
      status = 'ready';
    },

    wakeSleepers(nowTick) {
      if (sleepers.size === 0) return;
      const due: ProcessId[] = [];
      for (const [pid, wakeAt] of sleepers) {
        if (wakeAt <= nowTick) due.push(pid);
      }
      for (const pid of due) {
        sleepers.delete(pid);
        const pcb = table.get(pid);
        if (!pcb) continue;
        transition(pcb, 'ready', 'sleep-expired');
        scheduler.enqueue(schedulableOf(pcb));
        bus.publish(events.schedulerEnqueuedEvent(now(), pid));
      }
    },

    nextWakeTick() {
      let earliest: number | null = null;
      for (const wakeAt of sleepers.values()) {
        if (earliest === null || wakeAt < earliest) earliest = wakeAt;
      }
      return earliest;
    },

    hasSleepers: () => sleepers.size > 0,

    hasRunnable() {
      return currentPid !== null || scheduler.size() > 0;
    },

    getSharedBase: () => sharedBase,

    getCurrentPid: () => currentPid,
    getStatus: () => status,
    getProcess: (pid) => table.get(pid),
    listProcesses: () => [...table.values()].sort((a, b) => a.pid - b.pid),

    getProcessTable() {
      return {
        processes: [...table.values()].sort((a, b) => a.pid - b.pid).map(summarize),
        currentPid,
      };
    },

    getSchedulerSnapshot: () => scheduler.snapshot(),
    getMemoryMap: () => memory.memoryMap(),
    getHeapBlocks: (pid) => heapFor(pid)?.blocks() ?? [],

    getSnapshot() {
      return {
        status,
        currentPid,
        uptimeTicks: now(),
        processTable: {
          processes: [...table.values()].sort((a, b) => a.pid - b.pid).map(summarize),
          currentPid,
        },
        scheduler: scheduler.snapshot(),
        memoryMap: memory.memoryMap(),
        lastFault,
      };
    },
  };
}
