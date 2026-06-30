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
import { createFifoScheduler, createRoundRobinScheduler } from '@novaos/scheduler';
import type { Scheduler, SchedulerSnapshot } from '@novaos/scheduler';
import { createKernel } from '@novaos/kernel';
import type {
  Kernel,
  KernelStatus,
  ProcessTableSnapshot,
  KernelSnapshot,
  RegisterPort,
} from '@novaos/kernel';
import { createBufferedOutput } from './output';
import type { ProgramImage } from './program';
import * as runtimeEvents from './events';

export type SchedulerChoice = 'fifo' | 'round-robin';

export interface NovaRuntimeOptions {
  readonly ramBytes?: number;
  readonly scheduler?: SchedulerChoice;
  readonly quantumTicks?: number;
  readonly seed?: number;
  readonly maxSteps?: number;
}

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
}

const DEFAULT_MAX_STEPS = 1_000_000;
const DEFAULT_QUANTUM = 4;

function makeScheduler(choice: SchedulerChoice, quantumTicks: number): Scheduler {
  return choice === 'round-robin'
    ? createRoundRobinScheduler({ quantumTicks })
    : createFifoScheduler();
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
  const kernel = createKernel({ bus, clock, memory, scheduler, registerPort, output, random });

  const syscallTrap: SyscallTrap = { invoke: (request) => kernel.handleSyscall(request) };
  const ctx: VmExecutionContext = { memory, bus, clock, output, syscallTrap };

  function step(): CpuStepResult | null {
    if (!kernel.hasRunnable()) return null;
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
      while (steps < maxSteps && kernel.hasRunnable()) {
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
  };
}
