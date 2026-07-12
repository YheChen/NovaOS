import { describe, it, expect } from 'vitest';
import { runRace, firstRacingSeed, type RaceResult } from './race-demo';

const CONFIG = { threads: 4, incrementsPerThread: 20 } as const;

describe('race demo — unsynchronized', () => {
  it('loses updates for at least one interleaving', () => {
    const raced: RaceResult[] = [];
    for (let seed = 0; seed < 50; seed += 1) {
      const result = runRace({ ...CONFIG, useLock: false, seed });
      expect(result.finalCounter).toBeLessThanOrEqual(result.expected); // never over-counts
      if (result.raced) raced.push(result);
    }
    expect(raced.length).toBeGreaterThan(0);
    const worst = raced.reduce((a, b) => (a.lostUpdates > b.lostUpdates ? a : b));
    expect(worst.lostUpdates).toBe(worst.expected - worst.finalCounter);
    expect(worst.finalCounter).toBeLessThan(worst.expected);
  });

  it('findsRacingSeed points at a reproducible race', () => {
    const seed = firstRacingSeed(CONFIG);
    expect(seed).not.toBeNull();
    const result = runRace({ ...CONFIG, useLock: false, seed: seed as number });
    expect(result.raced).toBe(true);
  });
});

describe('race demo — mutex-protected', () => {
  it('never loses an update across many interleavings', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const result = runRace({ ...CONFIG, useLock: true, seed });
      expect(result.finalCounter).toBe(result.expected);
      expect(result.raced).toBe(false);
      expect(result.lostUpdates).toBe(0);
    }
  });

  it('serializes critical sections — only the lock owner touches shared state', () => {
    const result = runRace({ ...CONFIG, useLock: true, seed: 3 });
    for (const step of result.steps) {
      if (step.action === 'read' || step.action === 'add' || step.action === 'write') {
        // Whoever reads/adds/writes must currently hold the lock.
        expect(step.lockOwner).toBe(step.thread);
      }
    }
  });
});

describe('race demo — determinism', () => {
  it('same (config, seed) yields a byte-identical trace', () => {
    const a = runRace({ ...CONFIG, useLock: false, seed: 42 });
    const b = runRace({ ...CONFIG, useLock: false, seed: 42 });
    expect(a.steps).toEqual(b.steps);
    expect(a.finalCounter).toBe(b.finalCounter);
  });

  it('validates its configuration', () => {
    expect(() =>
      runRace({ threads: 0, incrementsPerThread: 1, useLock: false, seed: 1 }),
    ).toThrow();
    expect(() =>
      runRace({ threads: 1, incrementsPerThread: 0, useLock: false, seed: 1 }),
    ).toThrow();
  });
});
