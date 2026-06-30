import type { SimTime } from '@novaos/shared';
import type { EventInput } from '@novaos/events';
import type { VmFault } from '@novaos/cpu';

export const RuntimeEventType = {
  ProgramLoaded: 'runtime.program.loaded',
  Halted: 'runtime.halted',
  Faulted: 'runtime.faulted',
  StepLimit: 'runtime.step-limit',
} as const;

const runtimeEvent = (type: string, tick: SimTime, payload: unknown): EventInput => ({
  type,
  tick,
  source: 'runtime',
  payload,
});

export const programLoadedEvent = (
  tick: SimTime,
  entryPoint: number,
  sizeBytes: number,
): EventInput => runtimeEvent(RuntimeEventType.ProgramLoaded, tick, { entryPoint, sizeBytes });

export const haltedEvent = (tick: SimTime): EventInput =>
  runtimeEvent(RuntimeEventType.Halted, tick, {});

export const faultedEvent = (tick: SimTime, fault: VmFault): EventInput =>
  runtimeEvent(RuntimeEventType.Faulted, tick, {
    code: fault.code,
    pc: fault.pc,
    message: fault.message,
  });

export const stepLimitEvent = (tick: SimTime, steps: number): EventInput =>
  runtimeEvent(RuntimeEventType.StepLimit, tick, { steps });
