/**
 * Deterministic, seedable pseudo-random number generator (Mulberry32).
 *
 * The scheduler, lottery selection, and any other "random" behavior must use
 * this instead of the global RNG so that replays are exact. State is a single
 * 32-bit integer, making it trivially serializable for snapshots.
 */
export interface DeterministicRandom {
  /** The seed this generator was created with. */
  readonly seed: number;
  /** Next unsigned 32-bit integer. */
  nextU32(): number;
  /** Next float in the half-open interval [0, 1). */
  nextFloat(): number;
  /** Next integer in [minInclusive, maxExclusive). */
  nextInt(minInclusive: number, maxExclusive: number): number;
  /** Pick an element from a non-empty array. */
  pick<T>(items: readonly T[]): T;
  /** Current internal state (for snapshotting). */
  getState(): number;
  /** Restore internal state (for replay). */
  setState(state: number): void;
  /** A copy at the current state. */
  clone(): DeterministicRandom;
}

export function createSeededRandom(seed: number): DeterministicRandom {
  let state = seed >>> 0;

  const nextU32 = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };

  const api: DeterministicRandom = {
    seed,
    nextU32,
    nextFloat: () => nextU32() / 0x1_0000_0000,
    nextInt: (minInclusive: number, maxExclusive: number) => {
      if (
        !Number.isInteger(minInclusive) ||
        !Number.isInteger(maxExclusive) ||
        maxExclusive <= minInclusive
      ) {
        throw new Error(
          `nextInt requires integers with maxExclusive > minInclusive (got ${minInclusive}, ${maxExclusive}).`,
        );
      }
      const range = maxExclusive - minInclusive;
      return minInclusive + (nextU32() % range);
    },
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) {
        throw new Error('pick() called on an empty array.');
      }
      const index = api.nextInt(0, items.length);
      return items[index] as T;
    },
    getState: () => state >>> 0,
    setState: (next: number) => {
      state = next >>> 0;
    },
    clone: () => {
      const copy = createSeededRandom(seed);
      copy.setState(state >>> 0);
      return copy;
    },
  };

  return api;
}
