import { describe, it, expect } from 'vitest';
import { generateWorkload, presetById, PRESET_WORKLOADS, type WorkloadSpec } from './workload';

const SPEC: WorkloadSpec = {
  count: 6,
  seed: 42,
  maxArrival: 8,
  minBurst: 1,
  maxBurst: 10,
  maxPriority: 3,
};

describe('generateWorkload', () => {
  it('is deterministic for a given spec', () => {
    expect(generateWorkload(SPEC).jobs).toEqual(generateWorkload(SPEC).jobs);
  });

  it('produces different jobs for different seeds', () => {
    const a = generateWorkload(SPEC).jobs;
    const b = generateWorkload({ ...SPEC, seed: 43 }).jobs;
    expect(a).not.toEqual(b);
  });

  it('respects the declared bounds and sorts by (arrival, pid)', () => {
    const { jobs } = generateWorkload(SPEC);
    expect(jobs).toHaveLength(SPEC.count);
    expect(new Set(jobs.map((j) => Number(j.pid))).size).toBe(SPEC.count);
    for (const j of jobs) {
      expect(j.burst).toBeGreaterThanOrEqual(SPEC.minBurst);
      expect(j.burst).toBeLessThanOrEqual(SPEC.maxBurst);
      expect(j.arrival).toBeGreaterThanOrEqual(0);
      expect(j.arrival).toBeLessThanOrEqual(SPEC.maxArrival);
      expect(j.priority).toBeGreaterThanOrEqual(0);
      expect(j.priority).toBeLessThanOrEqual(SPEC.maxPriority);
    }
    for (let i = 1; i < jobs.length; i += 1) {
      const prev = jobs[i - 1];
      const cur = jobs[i];
      if (!prev || !cur) continue;
      const ordered =
        prev.arrival < cur.arrival ||
        (prev.arrival === cur.arrival && Number(prev.pid) <= Number(cur.pid));
      expect(ordered).toBe(true);
    }
  });
});

describe('preset workloads', () => {
  it('exposes named presets, each with >= 2 jobs and bursts >= 1', () => {
    expect(PRESET_WORKLOADS.length).toBeGreaterThan(0);
    for (const w of PRESET_WORKLOADS) {
      expect(w.jobs.length).toBeGreaterThanOrEqual(2);
      for (const j of w.jobs) expect(j.burst).toBeGreaterThanOrEqual(1);
    }
  });

  it('looks presets up by name', () => {
    const first = PRESET_WORKLOADS[0];
    expect(first).toBeDefined();
    if (first) expect(presetById(first.name)).toBe(first);
    expect(presetById('nope')).toBeUndefined();
  });
});
