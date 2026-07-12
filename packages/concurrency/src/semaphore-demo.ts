import { createSeededRandom } from '@novaos/shared';
import { createSemaphore } from './semaphore';

/**
 * A bounded-resource demonstration for the counting semaphore.
 *
 * `workers` threads each need to enter a critical section `rounds` times, but a
 * semaphore admits at most `permits` of them at once. The interleaver greedily
 * fills the available permits (so utilisation peaks at `permits`) and then
 * releases a random holder, proving the semaphore caps concurrency: the number
 * of simultaneous holders never exceeds `permits`.
 */
export interface SemaphoreDemoConfig {
  readonly workers: number;
  readonly permits: number;
  readonly rounds: number;
  readonly seed: number;
}

export type SemaphoreAction = 'acquire' | 'release';

export interface SemaphoreStep {
  readonly index: number;
  readonly worker: number;
  readonly action: SemaphoreAction;
  /** Number of workers holding a permit immediately after this step. */
  readonly holding: number;
  readonly available: number;
}

export interface SemaphoreDemoResult {
  readonly config: SemaphoreDemoConfig;
  /** Peak simultaneous holders observed across the run. */
  readonly maxConcurrent: number;
  readonly permits: number;
  /** True when the peak never exceeded the permit count (always true here). */
  readonly respectedLimit: boolean;
  /** True when at least one worker had to wait for a permit. */
  readonly contended: boolean;
  readonly steps: readonly SemaphoreStep[];
}

interface Worker {
  readonly id: number;
  remaining: number;
  holding: boolean;
}

export function runSemaphoreDemo(config: SemaphoreDemoConfig): SemaphoreDemoResult {
  const { workers: workerCount, permits, rounds, seed } = config;
  if (!Number.isInteger(workerCount) || workerCount < 1) {
    throw new Error(`runSemaphoreDemo requires workers >= 1 (got ${workerCount}).`);
  }
  if (!Number.isInteger(rounds) || rounds < 1) {
    throw new Error(`runSemaphoreDemo requires rounds >= 1 (got ${rounds}).`);
  }

  const rng = createSeededRandom(seed);
  const semaphore = createSemaphore(permits);
  const workers: Worker[] = Array.from({ length: workerCount }, (_, id) => ({
    id,
    remaining: rounds,
    holding: false,
  }));

  const steps: SemaphoreStep[] = [];
  let maxConcurrent = 0;
  let contended = false;

  const wantsIn = (w: Worker): boolean => !w.holding && w.remaining > 0;
  const notDone = (w: Worker): boolean => w.holding || w.remaining > 0;
  const maxSteps = workerCount * rounds * 2 + 16;

  while (workers.some(notDone) && steps.length < maxSteps) {
    // Greedy: if a permit is free and someone wants in, admit them; this drives
    // utilisation up to the cap. Otherwise release a random current holder.
    const holders = workers.filter((w) => w.holding);
    const seekers = workers.filter(wantsIn);

    let worker: Worker;
    let action: SemaphoreAction;
    if (semaphore.available() > 0 && seekers.length > 0) {
      worker = rng.pick(seekers);
      action = 'acquire';
    } else if (holders.length > 0) {
      worker = rng.pick(holders);
      action = 'release';
    } else {
      // Permits exhausted and seekers waiting but no holders to release: only
      // possible when workers <= permits, which cannot exhaust permits. Break.
      break;
    }

    if (action === 'acquire') {
      // Record contention: someone else wanted in but there was no free permit.
      if (semaphore.available() === 0) contended = true;
      const granted = semaphore.tryAcquire(worker.id);
      if (granted) worker.holding = true;
    } else {
      semaphore.release(worker.id);
      worker.holding = false;
      worker.remaining -= 1;
    }

    const holding = workers.filter((w) => w.holding).length;
    if (holding > maxConcurrent) maxConcurrent = holding;
    // Contention also occurs whenever more workers want in than permits allow.
    if (semaphore.available() === 0 && workers.filter(wantsIn).length > 0) contended = true;

    steps.push({
      index: steps.length,
      worker: worker.id,
      action,
      holding,
      available: semaphore.available(),
    });
  }

  return {
    config,
    maxConcurrent,
    permits,
    respectedLimit: maxConcurrent <= permits,
    contended,
    steps,
  };
}
