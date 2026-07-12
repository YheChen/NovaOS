/**
 * A counting semaphore — a deterministic state machine that admits up to
 * `permits` concurrent holders. Like the mutex it performs no scheduling; it
 * only guarantees that the number of holders never exceeds the permit count.
 */
export interface SemaphoreSnapshot {
  readonly permits: number;
  readonly available: number;
  readonly holders: readonly number[];
  readonly waiters: readonly number[];
}

export interface Semaphore {
  available(): number;
  holders(): number[];
  waiters(): number[];
  /** Acquire a permit for `id`. Returns `true` when a permit was granted. */
  tryAcquire(id: number): boolean;
  /** Return the permit held by `id`. Returns `true` when a permit was freed. */
  release(id: number): boolean;
  snapshot(): SemaphoreSnapshot;
}

export function createSemaphore(permits: number): Semaphore {
  if (!Number.isInteger(permits) || permits < 1) {
    throw new Error(`createSemaphore requires an integer permits >= 1 (got ${permits}).`);
  }
  let available = permits;
  const held = new Set<number>();
  const waiting = new Set<number>();
  const sorted = (set: Set<number>): number[] => [...set].sort((a, b) => a - b);

  return {
    available: () => available,
    holders: () => sorted(held),
    waiters: () => sorted(waiting),
    tryAcquire(id) {
      if (held.has(id)) return true;
      if (available > 0) {
        available -= 1;
        held.add(id);
        waiting.delete(id);
        return true;
      }
      waiting.add(id);
      return false;
    },
    release(id) {
      if (!held.has(id)) return false;
      held.delete(id);
      available += 1;
      return true;
    },
    snapshot: () => ({
      permits,
      available,
      holders: sorted(held),
      waiters: sorted(waiting),
    }),
  };
}
