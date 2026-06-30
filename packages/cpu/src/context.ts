import type { Address, Result, SimulationClock } from '@novaos/shared';
import type { EventBus } from '@novaos/events';

/**
 * The narrow view of memory the CPU needs. The real `@novaos/memory` `Memory`
 * structurally satisfies this port, so the CPU does not depend on the memory
 * package (dependency inversion keeps the CPU decoupled).
 */
export interface MemoryPort {
  readByte(address: Address): Result<number>;
  readWord(address: Address): Result<number>;
}

/** A destination for program output (the M1 `PRINT` instruction writes here). */
export interface OutputSink {
  write(text: string): void;
}

/** Everything a single CPU step needs from the surrounding runtime. */
export interface VmExecutionContext {
  readonly memory: MemoryPort;
  readonly bus: EventBus;
  readonly clock: SimulationClock;
  readonly output: OutputSink;
}
