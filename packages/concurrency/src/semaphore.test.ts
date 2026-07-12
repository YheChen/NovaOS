import { describe, it, expect } from 'vitest';
import { createSemaphore } from './semaphore';
import { runSemaphoreDemo } from './semaphore-demo';

describe('semaphore', () => {
  it('admits up to `permits` holders and blocks the rest', () => {
    const s = createSemaphore(2);
    expect(s.tryAcquire(1)).toBe(true);
    expect(s.tryAcquire(2)).toBe(true);
    expect(s.available()).toBe(0);
    expect(s.tryAcquire(3)).toBe(false);
    expect(s.holders()).toEqual([1, 2]);
    expect(s.waiters()).toEqual([3]);
  });

  it('frees a permit on release so a waiter can proceed', () => {
    const s = createSemaphore(1);
    s.tryAcquire(1);
    expect(s.tryAcquire(2)).toBe(false);
    expect(s.release(1)).toBe(true);
    expect(s.available()).toBe(1);
    expect(s.tryAcquire(2)).toBe(true);
  });

  it('rejects an invalid permit count', () => {
    expect(() => createSemaphore(0)).toThrow();
  });
});

describe('semaphore bounded-resource demo', () => {
  it('never exceeds the permit count and contends when oversubscribed', () => {
    for (let seed = 0; seed < 25; seed += 1) {
      const result = runSemaphoreDemo({ workers: 5, permits: 2, rounds: 3, seed });
      expect(result.respectedLimit).toBe(true);
      expect(result.maxConcurrent).toBeLessThanOrEqual(2);
      // With more workers than permits the cap is actually reached and gates.
      expect(result.maxConcurrent).toBe(2);
      expect(result.contended).toBe(true);
    }
  });

  it('is deterministic for a fixed seed', () => {
    const a = runSemaphoreDemo({ workers: 4, permits: 2, rounds: 2, seed: 7 });
    const b = runSemaphoreDemo({ workers: 4, permits: 2, rounds: 2, seed: 7 });
    expect(a.steps).toEqual(b.steps);
  });
});
