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
  hasRunnable(): boolean;
  getCurrentPid(): ProcessId | null;
  getStatus(): KernelStatus;
  getProcess(pid: ProcessId): ProcessControlBlock | undefined;
  listProcesses(): ProcessControlBlock[];
  getProcessTable(): ProcessTableSnapshot;
  getSchedulerSnapshot(): ReturnType<Scheduler['snapshot']>;
  getMemoryMap(): ReturnType<Memory['memoryMap']>;
  getSnapshot(): KernelSnapshot;
}

const BOOT_STAGES = ['cpu', 'memory', 'scheduler', 'syscalls', 'init', 'shell'] as const;

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

  const now = () => clock.now();
  const schedContext = (): SchedulingContext => ({ currentPid, tick: now(), random });

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
    return {
      pid: pcb.pid,
      priority: pcb.priority,
      arrivalSequence: pcb.scheduling.arrivalSequence,
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
      scheduling: { quantumRemaining: 0, lastScheduledAtTick: null, arrivalSequence },
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
      });

      if (outcome.kind === 'return') {
        bus.publish(events.syscallCompletedEvent(now(), pid, request.id, name, outcome.value));
        return { kind: 'return', returnValue: outcome.value };
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

    hasRunnable() {
      return currentPid !== null || scheduler.size() > 0;
    },

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
