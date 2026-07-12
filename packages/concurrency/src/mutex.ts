/**
 * A minimal, deterministic mutual-exclusion lock.
 *
 * This is a pure state machine: no timers, no async, no scheduling. Something
 * *else* (see the race demo's interleaver) decides when each contending thread
 * attempts to lock; the mutex only enforces the one invariant that matters —
 * at most one thread holds it at any instant.
 */
export interface MutexSnapshot {
  readonly owner: number | null;
  readonly waiters: readonly number[];
}

export interface Mutex {
  /** The thread id currently holding the lock, or `null` when free. */
  owner(): number | null;
  isLocked(): boolean;
  /**
   * Attempt to acquire the lock for `threadId`. Returns `true` when acquired —
   * either the lock was free, or `threadId` already owns it (re-entrant). On
   * failure the thread is recorded as a waiter and `false` is returned.
   */
  tryLock(threadId: number): boolean;
  /**
   * Release the lock. Returns `true` when `threadId` owned it (the lock is now
   * free); `false` is a no-op — you cannot release a lock you do not hold.
   */
  unlock(threadId: number): boolean;
  waiters(): number[];
  snapshot(): MutexSnapshot;
}

export function createMutex(): Mutex {
  let owner: number | null = null;
  const waiting = new Set<number>();
  const sortedWaiters = (): number[] => [...waiting].sort((a, b) => a - b);

  return {
    owner: () => owner,
    isLocked: () => owner !== null,
    tryLock(threadId) {
      if (owner === null) {
        owner = threadId;
        waiting.delete(threadId);
        return true;
      }
      if (owner === threadId) return true;
      waiting.add(threadId);
      return false;
    },
    unlock(threadId) {
      if (owner !== threadId) return false;
      owner = null;
      return true;
    },
    waiters: sortedWaiters,
    snapshot: () => ({ owner, waiters: sortedWaiters() }),
  };
}
