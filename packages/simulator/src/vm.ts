import { createCpu } from '@novaos/cpu';
import type {
  CpuStepResult,
  CpuSnapshot,
  RegisterFileSnapshot,
  VmExecutionContext,
} from '@novaos/cpu';
import { createMemory, DEFAULT_RAM_BYTES } from '@novaos/memory';
import type { MemorySnapshot } from '@novaos/memory';
import { createEventBus, createEventRecorder } from '@novaos/events';
import type { DomainEvent } from '@novaos/events';
import { createSimulationClock, asAddress } from '@novaos/shared';
import { createBufferedOutput } from './output';
import type { ProgramImage } from './program';
import * as runtimeEvents from './events';

export type VmStatus = 'ready' | 'running' | 'halted' | 'faulted';

export interface VirtualMachineOptions {
  readonly program: ProgramImage;
  readonly ramBytes?: number;
  /** Safety cap on continuous execution (guards against infinite loops). */
  readonly maxSteps?: number;
}

export interface VmSnapshot {
  readonly status: VmStatus;
  readonly clock: number;
  readonly cpu: CpuSnapshot;
  readonly memory: MemorySnapshot;
}

export interface VmRunResult {
  readonly steps: number;
  readonly status: VmStatus;
}

export interface VirtualMachine {
  step(): CpuStepResult | null;
  run(): VmRunResult;
  getStatus(): VmStatus;
  getOutput(): string;
  getOutputLines(): string[];
  getRegisters(): RegisterFileSnapshot;
  getEvents(): readonly DomainEvent[];
  getSnapshot(): VmSnapshot;
}

const DEFAULT_MAX_STEPS = 1_000_000;

export function createVirtualMachine(options: VirtualMachineOptions): VirtualMachine {
  const ramBytes = options.ramBytes ?? DEFAULT_RAM_BYTES;
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;

  const memory = createMemory(ramBytes);
  const bus = createEventBus();
  const recorder = createEventRecorder();
  recorder.attach(bus);
  const clock = createSimulationClock();
  const output = createBufferedOutput();

  const cpu = createCpu();
  cpu.reset({ pc: options.program.entryPoint, sp: ramBytes, bp: ramBytes });

  let status: VmStatus = 'ready';

  const loaded = memory.load(asAddress(options.program.entryPoint), options.program.code);
  if (!loaded.ok) {
    status = 'faulted';
  }
  bus.publish(
    runtimeEvents.programLoadedEvent(
      clock.now(),
      options.program.entryPoint,
      options.program.code.length,
    ),
  );

  const ctx: VmExecutionContext = { memory, bus, clock, output };

  const isTerminal = (): boolean => status === 'halted' || status === 'faulted';

  function step(): CpuStepResult | null {
    if (isTerminal()) return null;
    status = 'running';
    const result = cpu.step(ctx);
    clock.tick(result.cycles);
    if (result.status === 'halted') {
      status = 'halted';
      bus.publish(runtimeEvents.haltedEvent(clock.now()));
    } else if (result.status === 'fault') {
      status = 'faulted';
      if (result.fault) bus.publish(runtimeEvents.faultedEvent(clock.now(), result.fault));
    }
    return result;
  }

  function run(): VmRunResult {
    let steps = 0;
    while (!isTerminal() && steps < maxSteps) {
      step();
      steps += 1;
    }
    if (!isTerminal()) {
      status = 'faulted';
      bus.publish(runtimeEvents.stepLimitEvent(clock.now(), steps));
    }
    return { steps, status };
  }

  return {
    step,
    run,
    getStatus: () => status,
    getOutput: () => output.getText(),
    getOutputLines: () => output.getLines(),
    getRegisters: () => cpu.getRegisters(),
    getEvents: () => recorder.getEvents(),
    getSnapshot: () => ({
      status,
      clock: clock.now(),
      cpu: cpu.getSnapshot(),
      memory: memory.snapshot(),
    }),
  };
}
