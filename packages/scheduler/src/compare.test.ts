import { describe, it, expect } from 'vitest';
import { processId, asSimTime, createSeededRandom } from '@novaos/shared';
import {
  simulateAlgorithm,
  compareSchedulers,
  ALL_ALGORITHMS,
  type CompareAlgorithm,
} from './compare';
import { createSjfScheduler } from './sjf';
import type { SchedulingContext } from './scheduler';
import type { SimJob, Workload } from './workload';

const mk = (name: string, rows: ReadonlyArray<readonly [number, number, number]>): Workload => ({
  name,
  seed: 0,
  jobs: rows.map(([arrival, burst, priority], i): SimJob => ({
    pid: processId(i),
    label: `J${i}`,
    arrival,
    burst,
    priority,
  })),
});

const nonIdle = (run: ReturnType<typeof simulateAlgorithm>) =>
  run.timeline.filter((s) => s.pid !== null);

describe('compare — FIFO oracle', () => {
  it('runs jobs in arrival order with exact metrics and timeline', () => {
    const wl = mk('fifo', [
      [0, 3, 0],
      [0, 2, 0],
    ]);
    const run = simulateAlgorithm(wl, 'fifo');
    const [j0, j1] = run.metrics.perJob;
    expect(j0).toMatchObject({ turnaround: 3, waiting: 0, response: 0 });
    expect(j1).toMatchObject({ turnaround: 5, waiting: 3, response: 3 });
    expect(nonIdle(run).map((s) => [s.label, s.start, s.end])).toEqual([
      ['J0', 0, 3],
      ['J1', 3, 5],
    ]);
  });
});

describe('compare — SJF beats FIFO on average waiting', () => {
  it('shortest-first lowers mean waiting for a convoy', () => {
    const wl = mk('convoy', [
      [0, 6, 0],
      [0, 2, 0],
      [0, 1, 0],
    ]);
    const fifo = simulateAlgorithm(wl, 'fifo').metrics.avgWaiting;
    const sjf = simulateAlgorithm(wl, 'sjf').metrics.avgWaiting;
    expect(sjf).toBeLessThan(fifo);
  });
});

describe('compare — SRTF preempts', () => {
  it('splits the long job when a shorter one arrives mid-flight', () => {
    const wl = mk('srtf', [
      [0, 5, 0],
      [2, 1, 0],
    ]);
    const run = simulateAlgorithm(wl, 'srtf');
    const j0Segments = run.timeline.filter((s) => s.label === 'J0');
    expect(j0Segments.length).toBeGreaterThanOrEqual(2); // preempted
    const j0 = run.metrics.perJob.find((m) => m.label === 'J0');
    const j1 = run.metrics.perJob.find((m) => m.label === 'J1');
    expect(j1 && j0 && j1.completionTick).toBeLessThan(j0?.completionTick ?? Infinity);
  });
});

describe('compare — Round Robin quantum', () => {
  it('interleaves two equal jobs and counts context switches', () => {
    const wl = mk('rr', [
      [0, 4, 0],
      [0, 4, 0],
    ]);
    const run = simulateAlgorithm(wl, 'round-robin', { quantumTicks: 2 });
    expect(nonIdle(run).map((s) => [s.label, s.start, s.end])).toEqual([
      ['J0', 0, 2],
      ['J1', 2, 4],
      ['J0', 4, 6],
      ['J1', 6, 8],
    ]);
    expect(run.metrics.contextSwitches).toBe(4);
  });
});

describe('compare — Priority', () => {
  it('runs the lower priority number first when both are ready', () => {
    const wl = mk('prio', [
      [0, 2, 5],
      [0, 2, 1],
    ]);
    const run = simulateAlgorithm(wl, 'priority');
    expect(nonIdle(run).map((s) => s.label)).toEqual(['J1', 'J0']);
  });
});

describe('compare — Lottery determinism', () => {
  it('is identical across runs with the same lottery seed', () => {
    const wl = mk('lot', [
      [0, 3, 0],
      [0, 3, 1],
      [0, 3, 2],
    ]);
    const a = simulateAlgorithm(wl, 'lottery', { lotterySeed: 7 });
    const b = simulateAlgorithm(wl, 'lottery', { lotterySeed: 7 });
    expect(a).toEqual(b);
  });
});

describe('compare — MLFQ', () => {
  it('gives a later short job CPU before a demoted long job finishes', () => {
    const wl = mk('mlfq', [
      [0, 10, 0],
      [5, 1, 0],
    ]);
    const run = simulateAlgorithm(wl, 'mlfq', { quantumTicks: 2, mlfqLevels: 3 });
    const j0Segments = run.timeline.filter((s) => s.label === 'J0');
    expect(j0Segments.length).toBeGreaterThanOrEqual(2); // long job was preempted
    const j0 = run.metrics.perJob.find((m) => m.label === 'J0');
    const j1 = run.metrics.perJob.find((m) => m.label === 'J1');
    expect(j1 && j0 && j1.completionTick).toBeLessThan(j0?.completionTick ?? Infinity);
  });
});

describe('compare — invariants across every algorithm', () => {
  const wl = mk('mixed', [
    [0, 3, 1],
    [1, 6, 2],
    [3, 1, 0],
    [4, 4, 1],
  ]);

  it('holds the metric identities and a contiguous, work-conserving timeline', () => {
    const totalBurst = wl.jobs.reduce((s, j) => s + j.burst, 0);
    for (const algo of ALL_ALGORITHMS) {
      const run = simulateAlgorithm(wl, algo, { quantumTicks: 2 });
      for (const m of run.metrics.perJob) {
        expect(m.waiting).toBe(m.turnaround - m.burst);
        expect(m.turnaround).toBeGreaterThanOrEqual(m.burst);
        expect(m.response).toBeLessThanOrEqual(m.waiting);
      }
      // Timeline is contiguous from 0 and covers every tick.
      let cursor = 0;
      for (const seg of run.timeline) {
        expect(seg.start).toBe(cursor);
        cursor = seg.end;
      }
      // Work conservation: non-idle time equals the total burst.
      const busy = run.timeline
        .filter((s) => s.pid !== null)
        .reduce((s, seg) => s + (seg.end - seg.start), 0);
      expect(busy).toBe(totalBurst);
      if (run.metrics.makespan > 0) {
        expect(run.metrics.throughput).toBeCloseTo(wl.jobs.length / run.metrics.makespan, 10);
      }
    }
  });

  it('is deterministic for every non-lottery policy', () => {
    for (const algo of ['fifo', 'priority', 'sjf', 'srtf', 'mlfq'] as CompareAlgorithm[]) {
      expect(simulateAlgorithm(wl, algo, { quantumTicks: 2 })).toEqual(
        simulateAlgorithm(wl, algo, { quantumTicks: 2 }),
      );
    }
  });
});

describe('compareSchedulers', () => {
  it('returns one run per algorithm in ALL_ALGORITHMS order with a shared x-axis', () => {
    const wl = mk('all', [
      [0, 3, 1],
      [0, 2, 0],
      [2, 4, 2],
    ]);
    const result = compareSchedulers(wl, { quantumTicks: 2 });
    expect(result.runs.map((r) => r.metrics.algorithm)).toEqual(ALL_ALGORITHMS);
    const maxEnd = Math.max(...result.runs.map((r) => r.timeline[r.timeline.length - 1]?.end ?? 0));
    expect(result.totalTicks).toBe(maxEnd);
  });

  it('can restrict to a subset of algorithms', () => {
    const wl = mk('subset', [
      [0, 2, 0],
      [0, 1, 0],
    ]);
    const result = compareSchedulers(wl, { algorithms: ['fifo', 'sjf'] });
    expect(result.runs.map((r) => r.metrics.algorithm)).toEqual(['fifo', 'sjf']);
  });
});

describe('compare — reconciliation with the real SJF scheduler', () => {
  it('the lab SJF order matches createSjfScheduler.pickNext on the same jobs', () => {
    const wl = mk('recon', [
      [0, 5, 0],
      [0, 2, 1],
      [0, 7, 0],
      [0, 1, 2],
    ]);
    // Real kernel-facing scheduler ranking.
    const s = createSjfScheduler();
    wl.jobs.forEach((j, i) =>
      s.enqueue({ pid: j.pid, priority: j.priority, arrivalSequence: i, estimatedBurst: j.burst }),
    );
    const ctx: SchedulingContext = {
      currentPid: null,
      tick: asSimTime(0),
      random: createSeededRandom(1),
    };
    const realOrder: number[] = [];
    for (let pid = s.pickNext(ctx); pid !== null; pid = s.pickNext(ctx))
      realOrder.push(Number(pid));

    // Lab SJF: all jobs arrive at t=0, non-preemptive ⇒ segment order == pick order.
    const labOrder = nonIdle(simulateAlgorithm(wl, 'sjf')).map((seg) => Number(seg.pid));
    expect(labOrder).toEqual(realOrder);
  });
});
