import type { SimTime } from './ids';
import { asSimTime } from './ids';

/**
 * Deterministic simulated clock. Domain behavior must read time from a
 * `SimulationClock` rather than wall-clock APIs, so that the same program with
 * the same inputs always advances time identically.
 */
export interface SimulationClock {
  now(): SimTime;
  /** Advance the clock by `cycles` ticks and return the new time. */
  tick(cycles: number): SimTime;
  reset(): void;
}

export function createSimulationClock(start = 0): SimulationClock {
  let current = start;
  return {
    now: () => asSimTime(current),
    tick: (cycles: number) => {
      if (!Number.isFinite(cycles) || cycles < 0) {
        throw new Error(
          `SimulationClock.tick requires a non-negative number of cycles (got ${cycles}).`,
        );
      }
      current += cycles;
      return asSimTime(current);
    },
    reset: () => {
      current = start;
    },
  };
}
