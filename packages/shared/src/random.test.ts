import { describe, it, expect } from 'vitest';
import { createSeededRandom } from './random';

describe('DeterministicRandom', () => {
  it('produces identical sequences for identical seeds', () => {
    const a = createSeededRandom(1234);
    const b = createSeededRandom(1234);
    const seqA = Array.from({ length: 16 }, () => a.nextU32());
    const seqB = Array.from({ length: 16 }, () => b.nextU32());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = createSeededRandom(1);
    const b = createSeededRandom(2);
    expect(a.nextU32()).not.toBe(b.nextU32());
  });

  it('nextFloat stays in [0, 1)', () => {
    const r = createSeededRandom(99);
    for (let i = 0; i < 1000; i += 1) {
      const f = r.nextFloat();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });

  it('nextInt stays within bounds and validates its range', () => {
    const r = createSeededRandom(7);
    for (let i = 0; i < 1000; i += 1) {
      const n = r.nextInt(10, 20);
      expect(n).toBeGreaterThanOrEqual(10);
      expect(n).toBeLessThan(20);
    }
    expect(() => r.nextInt(5, 5)).toThrow();
  });

  it('snapshots and restores state for exact replay', () => {
    const r = createSeededRandom(555);
    r.nextU32();
    r.nextU32();
    const state = r.getState();
    const continued = [r.nextU32(), r.nextU32(), r.nextU32()];

    const replay = createSeededRandom(555);
    replay.setState(state);
    expect([replay.nextU32(), replay.nextU32(), replay.nextU32()]).toEqual(continued);
  });

  it('clone continues the same sequence independently', () => {
    const r = createSeededRandom(2024);
    r.nextU32();
    const clone = r.clone();
    expect(clone.nextU32()).toBe(r.nextU32());
  });

  it('pick throws on an empty array', () => {
    expect(() => createSeededRandom(1).pick([])).toThrow();
  });
});
