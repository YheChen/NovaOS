import { describe, it, expect } from 'vitest';
import { createMutex } from './mutex';

describe('mutex', () => {
  it('grants the lock to the first caller and blocks others', () => {
    const m = createMutex();
    expect(m.tryLock(1)).toBe(true);
    expect(m.owner()).toBe(1);
    expect(m.tryLock(2)).toBe(false);
    expect(m.waiters()).toEqual([2]);
    expect(m.isLocked()).toBe(true);
  });

  it('is re-entrant for the current owner', () => {
    const m = createMutex();
    m.tryLock(1);
    expect(m.tryLock(1)).toBe(true);
    expect(m.owner()).toBe(1);
  });

  it('only lets the owner unlock, then hands the lock to a new caller', () => {
    const m = createMutex();
    m.tryLock(1);
    expect(m.unlock(2)).toBe(false); // not the owner — no-op
    expect(m.owner()).toBe(1);
    expect(m.unlock(1)).toBe(true);
    expect(m.owner()).toBe(null);
    expect(m.tryLock(2)).toBe(true);
    expect(m.waiters()).toEqual([]);
  });
});
