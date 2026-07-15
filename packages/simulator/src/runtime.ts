import { createCpu } from '@novaos/cpu';
import type {
  CpuStepResult,
  RegisterFileSnapshot,
  SyscallTrap,
  VmExecutionContext,
} from '@novaos/cpu';
import { createMemory, DEFAULT_RAM_BYTES } from '@novaos/memory';
import type { MemoryMapSnapshot } from '@novaos/memory';
import { createEventBus, createEventRecorder } from '@novaos/events';
import type { DomainEvent } from '@novaos/events';
import {
  createSimulationClock,
  createSeededRandom,
  asAddress,
  type ProcessId,
} from '@novaos/shared';
import {
  createFifoScheduler,
  createRoundRobinScheduler,
  createPriorityScheduler,
  createLotteryScheduler,
  createSjfScheduler,
  createSrtfScheduler,
  createMlfqScheduler,
} from '@novaos/scheduler';
import type { Scheduler, SchedulerSnapshot } from '@novaos/scheduler';
import { createKernel } from '@novaos/kernel';
import type {
  Kernel,
  KernelStatus,
  ProcessTableSnapshot,
  KernelSnapshot,
  RegisterPort,
} from '@novaos/kernel';
import {
  createIdentityPaging,
  createTranslatingMemory,
  type AddressTranslator,
  type TranslationStats,
} from './paging';
import { createBufferedOutput } from './output';
import type { ProgramImage } from './program';
import * as runtimeEvents from './events';

export type SchedulerChoice =
  'fifo' | 'round-robin' | 'priority' | 'lottery' | 'sjf' | 'srtf' | 'mlfq';

export interface PagingRuntimeOptions {
  readonly pageSizeBytes?: number;
  readonly tlbCapacity?: number;
}

export interface NovaRuntimeOptions {
  readonly ramBytes?: number;
  readonly scheduler?: SchedulerChoice;
  readonly quantumTicks?: number;
  readonly seed?: number;
  readonly maxSteps?: number;
  /** Per-process stack size. Defaults to 4 KB — enough for deep Toy C recursion. */
  readonly stackBytes?: number;
  /**
   * Route every CPU fetch/load/store through an (identity-mapped) MMU so
   * accesses walk a page table + TLB. Transparent to results; exposes
   * translation stats via `getTranslationStats()`. Off by default.
   */
  readonly paging?: boolean | PagingRuntimeOptions;
}

const DEFAULT_STACK_BYTES = 4096;

export interface SpawnOptions {
  readonly parentPid?: ProcessId | null;
  readonly priority?: number;
}

export interface RuntimeRunResult {
  readonly steps: number;
  readonly status: KernelStatus;
}

export interface NovaRuntime {
  boot(): void;
  spawn(name: string, program: ProgramImage, options?: SpawnOptions): ProcessId;
  step(): CpuStepResult | null;
  run(): RuntimeRunResult;
  getKernel(): Kernel;
  getStatus(): KernelStatus;
  /** Live CPU register snapshot (read-only; for the debugger). */
  getRegisters(): RegisterFileSnapshot;
  /** Read a 32-bit word from memory (read-only; for the debugger). Null if out of bounds. */
  readWord(address: number): number | null;
  getOutput(): string;
  getOutputLines(): string[];
  getEvents(): readonly DomainEvent[];
  getProcessTable(): ProcessTableSnapshot;
  getSchedulerSnapshot(): SchedulerSnapshot;
  getMemoryMap(): MemoryMapSnapshot;
  getSnapshot(): { kernel: KernelSnapshot; clock: number };
  /** MMU translation stats when paging is enabled; `null` otherwise. */
  getTranslationStats(): TranslationStats | null;
}

const DEFAULT_MAX_STEPS = 1_000_000;
const DEFAULT_QUANTUM = 4;

function makeScheduler(choice: SchedulerChoice, quantumTicks: number): Scheduler {
  switch (choice) {
    case 'round-robin':
      return createRoundRobinScheduler({ quantumTicks });
    case 'priority':
      return createPriorityScheduler();
    case 'lottery':
      return createLotteryScheduler({ quantumTicks });
    case 'sjf':
      return createSjfScheduler();
    case 'srtf':
      return createSrtfScheduler();
    case 'mlfq':
      return createMlfqScheduler();
    default:
      return createFifoScheduler();
  }
}

/**
 * The kernel-driven runtime (Milestone 2). Wires the CPU, memory, scheduler, and
 * kernel together: the kernel owns policy (processes, scheduling, syscalls,
 * context switches); this runtime owns the loop (clock, stepping, timer).
 */
export function createNovaRuntime(options: NovaRuntimeOptions = {}): NovaRuntime {
  const ramBytes = options.ramBytes ?? DEFAULT_RAM_BYTES;
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const quantumTicks = options.quantumTicks ?? DEFAULT_QUANTUM;

  const memory = createMemory(ramBytes);
  const bus = createEventBus();
  const recorder = createEventRecorder();
  recorder.attach(bus);
  const clock = createSimulationClock();
  const output = createBufferedOutput();
  const random = createSeededRandom(options.seed ?? 1);

  const cpu = createCpu();
  const registerPort: RegisterPort = {
    capture: () => cpu.getRegisters(),
    load: (snapshot) => cpu.restoreSnapshot({ registers: snapshot }),
  };

  const scheduler = makeScheduler(options.scheduler ?? 'round-robin', quantumTicks);
  const kernel = createKernel({
    bus,
    clock,
    memory,
    scheduler,
    registerPort,
    output,
    random,
    config: { defaultStackBytes: options.stackBytes ?? DEFAULT_STACK_BYTES },
  });

  // Optionally route the CPU's memory accesses through an identity-mapped MMU.
  // The kernel keeps the real (physical) memory for setup; only the CPU's view
  // is translated, so behavior is unchanged while accesses walk a page table.
  const pagingOpt = options.paging;
  const translator: AddressTranslator | null = pagingOpt
    ? createIdentityPaging({
        ramBytes,
        ...(typeof pagingOpt === 'object' ? pagingOpt : {}),
      })
    : null;
  const cpuMemory = translator ? createTranslatingMemory(memory, translator) : memory;

  const syscallTrap: SyscallTrap = { invoke: (request) => kernel.handleSyscall(request) };
  const ctx: VmExecutionContext = { memory: cpuMemory, bus, clock, output, syscallTrap };

  function step(): CpuStepResult | null {
    // Wake anything whose sleep timer has elapsed before choosing what to run.
    kernel.wakeSleepers(Number(clock.now()));

    // If nothing is ready but processes are sleeping, idle-advance the clock to
    // the earliest wake time (the CPU has no work until then).
    if (kernel.getCurrentPid() === null && !kernel.hasRunnable()) {
      const next = kernel.nextWakeTick();
      if (next === null) return null;
      const now = Number(clock.now());
      if (next > now) clock.tick(next - now);
      kernel.wakeSleepers(Number(clock.now()));
      if (!kernel.hasRunnable()) return null;
    }

    if (kernel.getCurrentPid() === null) {
      const dispatched = kernel.dispatch();
      if (dispatched === null) return null;
    }

    const result = cpu.step(ctx);
    clock.tick(result.cycles);
    kernel.recordInstruction(result.cycles);

    if (result.status === 'halted') {
      const exited = result.syscall != null && result.syscall.outcome.kind === 'exit';
      const code = exited && result.syscall ? result.syscall.outcome.code : 0;
      kernel.terminateCurrent(exited ? 'exited' : 'halted', code >>> 0);
    } else if (result.status === 'fault') {
      kernel.faultCurrent({
        code: result.fault?.code ?? 'fault',
        message: result.fault?.message ?? 'CPU fault',
        tick: clock.now(),
      });
    } else if (result.status === 'blocked') {
      // A blocking syscall (sleep) or yield descheduled the process.
      kernel.commitDeschedule();
    } else if (kernel.shouldPreempt()) {
      kernel.handleTimerInterrupt();
    }

    return result;
  }

  return {
    boot() {
      kernel.boot();
    },

    spawn(name, program, spawnOptions = {}) {
      const created = kernel.createProcess({
        name,
        image: { code: program.code, entryOffset: program.entryPoint },
        admit: true,
        parentPid: spawnOptions.parentPid ?? null,
        priority: spawnOptions.priority ?? 0,
      });
      if (!created.ok) {
        throw new Error(`Failed to spawn "${name}": ${created.error.message}`);
      }
      return created.value;
    },

    step,

    run() {
      let steps = 0;
      // Keep running while anything is runnable OR sleeping (a sleeper will wake).
      while (steps < maxSteps && (kernel.hasRunnable() || kernel.hasSleepers())) {
        const result = step();
        if (result === null) break;
        steps += 1;
      }
      if (steps >= maxSteps && kernel.hasRunnable()) {
        bus.publish(runtimeEvents.stepLimitEvent(clock.now(), steps));
      }
      return { steps, status: kernel.getStatus() };
    },

    getKernel: () => kernel,
    getStatus: () => kernel.getStatus(),
    getRegisters: () => cpu.getRegisters(),
    readWord: (address) => {
      const result = memory.readWord(asAddress(address));
      return result.ok ? result.value : null;
    },
    getOutput: () => output.getText(),
    getOutputLines: () => output.getLines(),
    getEvents: () => recorder.getEvents(),
    getProcessTable: () => kernel.getProcessTable(),
    getSchedulerSnapshot: () => kernel.getSchedulerSnapshot(),
    getMemoryMap: () => kernel.getMemoryMap(),
    getSnapshot: () => ({ kernel: kernel.getSnapshot(), clock: clock.now() }),
    getTranslationStats: () => translator?.stats() ?? null,
  };
}
