import { createSeededRandom } from '@novaos/shared';
import { createMutex } from './mutex';

/**
 * The canonical "lost update" demonstration.
 *
 * Several worker threads each increment a single shared counter a fixed number
 * of times. An increment is *not* atomic — it decomposes into three micro-steps
 * that a preemptive scheduler may interleave freely:
 *
 *   read   register <- counter
 *   add    register <- register + 1
 *   write  counter  <- register
 *
 * When two threads `read` the same value before either `write`s it back, one of
 * the two increments is lost. With locking enabled each increment is wrapped in
 * `lock` / `unlock`, so a thread mid-increment cannot be interrupted by another
 * thread's critical section and the final count is always exact.
 *
 * The interleaving is chosen by a seeded PRNG, so a `(config, seed)` pair always
 * produces a byte-identical trace — the whole point of NovaOS: races you can
 * replay.
 */
export type MicroAction = 'lock' | 'read' | 'add' | 'write' | 'unlock';

const SEQUENCE_PLAIN: readonly MicroAction[] = ['read', 'add', 'write'];
const SEQUENCE_LOCKED: readonly MicroAction[] = ['lock', 'read', 'add', 'write', 'unlock'];

export interface RaceStep {
  /** Global step index (0-based) within the interleaving. */
  readonly index: number;
  /** The worker that advanced on this step. */
  readonly thread: number;
  readonly action: MicroAction;
  /** Shared counter value immediately after this step. */
  readonly counter: number;
  /** The acting worker's private register immediately after this step. */
  readonly register: number;
  /** Lock owner after this step (always `null` when locking is disabled). */
  readonly lockOwner: number | null;
}

export interface RaceConfig {
  readonly threads: number;
  readonly incrementsPerThread: number;
  readonly useLock: boolean;
  readonly seed: number;
}

export interface RaceResult {
  readonly config: RaceConfig;
  /** The race-free result: `threads * incrementsPerThread`. */
  readonly expected: number;
  readonly finalCounter: number;
  /** How many increments were silently dropped (`expected - finalCounter`). */
  readonly lostUpdates: number;
  /** True when the final counter disagrees with `expected`. */
  readonly raced: boolean;
  readonly steps: readonly RaceStep[];
}

interface Worker {
  readonly id: number;
  remaining: number;
  phase: number;
  register: number;
}

/** Run one deterministic interleaving of the shared-counter workload. */
export function runRace(config: RaceConfig): RaceResult {
  const { threads, incrementsPerThread, useLock, seed } = config;
  if (!Number.isInteger(threads) || threads < 1) {
    throw new Error(`runRace requires threads >= 1 (got ${threads}).`);
  }
  if (!Number.isInteger(incrementsPerThread) || incrementsPerThread < 1) {
    throw new Error(`runRace requires incrementsPerThread >= 1 (got ${incrementsPerThread}).`);
  }

  const sequence = useLock ? SEQUENCE_LOCKED : SEQUENCE_PLAIN;
  const rng = createSeededRandom(seed);
  const mutex = createMutex();
  const workers: Worker[] = Array.from({ length: threads }, (_, id) => ({
    id,
    remaining: incrementsPerThread,
    phase: 0,
    register: 0,
  }));

  let counter = 0;
  const steps: RaceStep[] = [];
  const isDone = (w: Worker): boolean => w.remaining === 0;

  // A worker can advance unless it is done, or its next action is `lock` and the
  // mutex is held by another worker (it is blocked, waiting on the lock).
  const runnable = (w: Worker): boolean => {
    if (isDone(w)) return false;
    if (sequence[w.phase] !== 'lock') return true;
    return !mutex.isLocked() || mutex.owner() === w.id;
  };

  // A generous upper bound: every micro-step of every increment, times a safety
  // factor for lock contention. Guards against a scheduling bug looping forever.
  const maxSteps = threads * incrementsPerThread * sequence.length * 4 + 16;

  while (workers.some((w) => !isDone(w)) && steps.length < maxSteps) {
    const ready = workers.filter(runnable);
    if (ready.length === 0) break; // deadlock guard (unreachable with one mutex)
    const worker = rng.pick(ready);
    const action = sequence[worker.phase] as MicroAction;

    switch (action) {
      case 'lock':
        mutex.tryLock(worker.id);
        break;
      case 'read':
        worker.register = counter;
        break;
      case 'add':
        worker.register += 1;
        break;
      case 'write':
        counter = worker.register;
        break;
      case 'unlock':
        mutex.unlock(worker.id);
        break;
    }

    worker.phase += 1;
    if (worker.phase >= sequence.length) {
      worker.phase = 0;
      worker.remaining -= 1;
    }

    steps.push({
      index: steps.length,
      thread: worker.id,
      action,
      counter,
      register: worker.register,
      lockOwner: mutex.owner(),
    });
  }

  const expected = threads * incrementsPerThread;
  return {
    config,
    expected,
    finalCounter: counter,
    lostUpdates: expected - counter,
    raced: counter !== expected,
    steps,
  };
}

/**
 * Scan seeds `[0, limit)` and return the first one whose *unsynchronized* run
 * loses at least one update, or `null` if none in range do. Handy for demos and
 * the UI, which want a reproducible interleaving that actually exhibits a race.
 */
export function firstRacingSeed(
  base: Omit<RaceConfig, 'seed' | 'useLock'>,
  limit = 256,
): number | null {
  for (let seed = 0; seed < limit; seed += 1) {
    if (runRace({ ...base, useLock: false, seed }).raced) return seed;
  }
  return null;
}
