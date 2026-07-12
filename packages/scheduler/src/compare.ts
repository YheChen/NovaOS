import type { ProcessId } from '@novaos/shared';
import { asSimTime, createSeededRandom } from '@novaos/shared';
import type { Scheduler, SchedulableProcess, SchedulingContext } from './scheduler';
import { createFifoScheduler } from './fifo';
import { createRoundRobinScheduler } from './round-robin';
import { createPriorityScheduler } from './priority';
import { createLotteryScheduler } from './lottery';
import { byBurst } from './sjf';
import type { SimJob, Workload } from './workload';

export type CompareAlgorithm =
  'fifo' | 'round-robin' | 'priority' | 'lottery' | 'sjf' | 'srtf' | 'mlfq';

export const ALL_ALGORITHMS: readonly CompareAlgorithm[] = [
  'fifo',
  'round-robin',
  'priority',
  'lottery',
  'sjf',
  'srtf',
  'mlfq',
];

const DISPLAY_NAME: Record<CompareAlgorithm, string> = {
  fifo: 'First Come First Served',
  'round-robin': 'Round Robin',
  priority: 'Priority',
  lottery: 'Lottery',
  sjf: 'Shortest Job First',
  srtf: 'Shortest Remaining Time First',
  mlfq: 'Multi-Level Feedback Queue',
};

export interface CompareOptions {
  readonly quantumTicks?: number;
  readonly lotterySeed?: number;
  readonly mlfqLevels?: number;
  readonly algorithms?: readonly CompareAlgorithm[];
}

const DEFAULT_QUANTUM = 4;
const DEFAULT_LOTTERY_SEED = 0xc0ffee;
const DEFAULT_MLFQ_LEVELS = 3;

export interface JobMetrics {
  readonly pid: ProcessId;
  readonly label: string;
  readonly arrival: number;
  readonly burst: number;
  readonly startTick: number;
  readonly completionTick: number;
  readonly turnaround: number;
  readonly waiting: number;
  readonly response: number;
}

export interface AlgorithmMetrics {
  readonly algorithm: CompareAlgorithm;
  readonly displayName: string;
  readonly avgTurnaround: number;
  readonly avgWaiting: number;
  readonly avgResponse: number;
  readonly makespan: number;
  readonly throughput: number;
  readonly contextSwitches: number;
  readonly perJob: readonly JobMetrics[];
}

export interface TimelineSegment {
  readonly pid: ProcessId | null;
  readonly label: string;
  readonly start: number;
  readonly end: number;
}

export interface AlgorithmRun {
  readonly metrics: AlgorithmMetrics;
  readonly timeline: readonly TimelineSegment[];
}

export interface ComparisonResult {
  readonly workload: Workload;
  readonly options: Required<Omit<CompareOptions, 'algorithms'>> & {
    algorithms: readonly CompareAlgorithm[];
  };
  readonly totalTicks: number;
  readonly runs: readonly AlgorithmRun[];
}

/**
 * A scheduling policy the single-CPU simulator drives. FIFO/RR/Priority/Lottery
 * wrap the real `Scheduler` implementations (so the lab agrees with the kernel);
 * SJF/SRTF/MLFQ are internal policies over the simulator's own burst state.
 */
interface SimPolicy {
  admit(job: SimJob, t: number): void;
  pick(t: number): ProcessId | null;
  requeue(job: SimJob, t: number): void;
  /** Quantum of the just-picked job; `null` = run to completion (non-preemptive). */
  quantumFor(): number | null;
  remove(pid: ProcessId): void;
}

function schedulerPolicy(
  scheduler: Scheduler,
  seq: Map<ProcessId, number>,
  seed: number,
): SimPolicy {
  const random = createSeededRandom(seed);
  const toSchedulable = (job: SimJob): SchedulableProcess => ({
    pid: job.pid,
    priority: job.priority,
    arrivalSequence: seq.get(job.pid) ?? 0,
  });
  const ctx = (t: number): SchedulingContext => ({
    currentPid: null,
    tick: asSimTime(t),
    random,
  });
  return {
    admit: (job) => scheduler.enqueue(toSchedulable(job)),
    pick: (t) => scheduler.pickNext(ctx(t)),
    requeue: (job, t) => scheduler.requeue(toSchedulable(job), ctx(t)),
    quantumFor: () => scheduler.quantumTicks,
    remove: (pid) => scheduler.remove(pid),
  };
}

function burstPolicy(
  seq: Map<ProcessId, number>,
  keyOf: (job: SimJob) => number,
  quantum: number | null,
): SimPolicy {
  let ready: SimJob[] = [];
  const rankable = (job: SimJob): SchedulableProcess => ({
    pid: job.pid,
    priority: job.priority,
    arrivalSequence: seq.get(job.pid) ?? 0,
    estimatedBurst: keyOf(job),
  });
  return {
    admit: (job) => ready.push(job),
    pick: () => {
      const chosen = [...ready].sort((a, b) => byBurst(rankable(a), rankable(b)))[0];
      if (!chosen) return null;
      ready = ready.filter((j) => j.pid !== chosen.pid);
      return chosen.pid;
    },
    requeue: (job) => ready.push(job),
    quantumFor: () => quantum,
    remove: (pid) => {
      ready = ready.filter((j) => j.pid !== pid);
    },
  };
}

function mlfqPolicy(levels: number, baseQuantum: number): SimPolicy {
  const queues: SimJob[][] = Array.from({ length: levels }, () => []);
  const levelOf = new Map<ProcessId, number>();
  let lastLevel = 0;
  const quantumAt = (lvl: number): number => baseQuantum * 2 ** lvl;
  return {
    admit: (job) => {
      const lvl = levelOf.get(job.pid) ?? 0;
      levelOf.set(job.pid, lvl);
      queues[lvl]?.push(job);
    },
    pick: () => {
      for (let lvl = 0; lvl < levels; lvl += 1) {
        const q = queues[lvl];
        if (!q || q.length === 0) continue;
        const chosen = q.shift();
        if (!chosen) continue;
        lastLevel = lvl;
        return chosen.pid;
      }
      return null;
    },
    requeue: (job) => {
      const cur = levelOf.get(job.pid) ?? 0;
      const next = Math.min(cur + 1, levels - 1); // demote for using a full quantum
      levelOf.set(job.pid, next);
      queues[next]?.push(job);
    },
    quantumFor: () => quantumAt(lastLevel),
    remove: (pid) => {
      for (const q of queues) {
        const i = q.findIndex((j) => j.pid === pid);
        if (i >= 0) q.splice(i, 1);
      }
      levelOf.delete(pid);
    },
  };
}

function makePolicy(
  algorithm: CompareAlgorithm,
  seq: Map<ProcessId, number>,
  opts: Required<Omit<CompareOptions, 'algorithms'>>,
): SimPolicy {
  switch (algorithm) {
    case 'fifo':
      return schedulerPolicy(createFifoScheduler(), seq, opts.lotterySeed);
    case 'round-robin':
      return schedulerPolicy(
        createRoundRobinScheduler({ quantumTicks: opts.quantumTicks }),
        seq,
        opts.lotterySeed,
      );
    case 'priority':
      return schedulerPolicy(createPriorityScheduler(), seq, opts.lotterySeed);
    case 'lottery':
      return schedulerPolicy(
        createLotteryScheduler({ quantumTicks: opts.quantumTicks }),
        seq,
        opts.lotterySeed,
      );
    case 'sjf':
      return burstPolicy(seq, (j) => j.burst, null);
    case 'srtf':
      // Ranked by *remaining* burst, so keyOf is rebound per pick via a closure
      // over the live remaining map (installed by simulateAlgorithm).
      throw new Error('srtf policy is constructed inline (needs remaining state)');
    case 'mlfq':
      return mlfqPolicy(opts.mlfqLevels, opts.quantumTicks);
  }
}

function coalesce(ticks: (ProcessId | null)[], jobs: readonly SimJob[]): TimelineSegment[] {
  const labelOf = new Map<ProcessId, string>(jobs.map((j) => [j.pid, j.label]));
  const segments: TimelineSegment[] = [];
  for (let i = 0; i < ticks.length; i += 1) {
    const pid = ticks[i] ?? null;
    const last = segments[segments.length - 1];
    if (last && last.pid === pid) {
      segments[segments.length - 1] = { ...last, end: i + 1 };
    } else {
      segments.push({
        pid,
        label: pid === null ? 'idle' : (labelOf.get(pid) ?? String(pid)),
        start: i,
        end: i + 1,
      });
    }
  }
  return segments;
}

export function simulateAlgorithm(
  workload: Workload,
  algorithm: CompareAlgorithm,
  options: CompareOptions = {},
): AlgorithmRun {
  const opts = {
    quantumTicks: options.quantumTicks ?? DEFAULT_QUANTUM,
    lotterySeed: options.lotterySeed ?? DEFAULT_LOTTERY_SEED,
    mlfqLevels: Math.max(1, Math.floor(options.mlfqLevels ?? DEFAULT_MLFQ_LEVELS)),
  };
  const jobs = workload.jobs;
  const byArrival = [...jobs].sort(
    (a, b) => a.arrival - b.arrival || Number(a.pid) - Number(b.pid),
  );
  const seq = new Map<ProcessId, number>(byArrival.map((j, i) => [j.pid, i]));
  const jobByPid = new Map<ProcessId, SimJob>(jobs.map((j) => [j.pid, j]));

  const remaining = new Map<ProcessId, number>(jobs.map((j) => [j.pid, j.burst]));
  const startTick = new Map<ProcessId, number>();
  const completionTick = new Map<ProcessId, number>();

  const policy =
    algorithm === 'srtf'
      ? burstPolicy(seq, (j) => remaining.get(j.pid) ?? j.burst, 1)
      : makePolicy(algorithm, seq, opts);

  const ticks: (ProcessId | null)[] = [];
  let current: ProcessId | null = null;
  let quantumLeft = Number.POSITIVE_INFINITY;
  let prevPid: ProcessId | null = null;
  let contextSwitches = 0;
  let completed = 0;
  let t = 0;
  const totalBurst = jobs.reduce((s, j) => s + j.burst, 0);
  const maxArrival = jobs.reduce((m, j) => Math.max(m, j.arrival), 0);
  const ceiling = totalBurst * 4 + maxArrival + 1;

  while (completed < jobs.length) {
    if (t > ceiling)
      throw new Error(`Scheduler simulation exceeded ${ceiling} ticks (non-termination).`);

    for (const job of byArrival) {
      if (job.arrival === t) policy.admit(job, t);
    }

    if (current === null) {
      current = policy.pick(t);
      if (current !== null) {
        if (!startTick.has(current)) startTick.set(current, t);
        quantumLeft = policy.quantumFor() ?? Number.POSITIVE_INFINITY;
        if (current !== prevPid) contextSwitches += 1;
        prevPid = current;
      }
    }

    if (current === null) {
      ticks.push(null); // CPU idle this tick
      t += 1;
      continue;
    }

    ticks.push(current);
    const left = (remaining.get(current) ?? 0) - 1;
    remaining.set(current, left);
    quantumLeft -= 1;
    t += 1;

    if (left === 0) {
      completionTick.set(current, t);
      policy.remove(current);
      completed += 1;
      current = null;
      quantumLeft = Number.POSITIVE_INFINITY;
    } else if (quantumLeft <= 0) {
      const job = jobByPid.get(current);
      if (job) policy.requeue(job, t);
      current = null;
    }
  }

  const perJob: JobMetrics[] = [...jobs]
    .sort((a, b) => Number(a.pid) - Number(b.pid))
    .map((j) => {
      const start = startTick.get(j.pid) ?? j.arrival;
      const completion = completionTick.get(j.pid) ?? j.arrival;
      const turnaround = completion - j.arrival;
      return {
        pid: j.pid,
        label: j.label,
        arrival: j.arrival,
        burst: j.burst,
        startTick: start,
        completionTick: completion,
        turnaround,
        waiting: turnaround - j.burst,
        response: start - j.arrival,
      };
    });

  const n = perJob.length || 1;
  const mean = (pick: (m: JobMetrics) => number): number =>
    perJob.reduce((s, m) => s + pick(m), 0) / n;
  const minArrival = jobs.reduce((m, j) => Math.min(m, j.arrival), jobs[0]?.arrival ?? 0);
  const lastCompletion = perJob.reduce((m, j) => Math.max(m, j.completionTick), 0);
  const makespan = lastCompletion - minArrival;

  const metrics: AlgorithmMetrics = {
    algorithm,
    displayName: DISPLAY_NAME[algorithm],
    avgTurnaround: mean((m) => m.turnaround),
    avgWaiting: mean((m) => m.waiting),
    avgResponse: mean((m) => m.response),
    makespan,
    throughput: makespan > 0 ? jobs.length / makespan : 0,
    contextSwitches,
    perJob,
  };

  return { metrics, timeline: coalesce(ticks, jobs) };
}

export function compareSchedulers(
  workload: Workload,
  options: CompareOptions = {},
): ComparisonResult {
  const algorithms = options.algorithms ?? ALL_ALGORITHMS;
  const resolved = {
    quantumTicks: options.quantumTicks ?? DEFAULT_QUANTUM,
    lotterySeed: options.lotterySeed ?? DEFAULT_LOTTERY_SEED,
    mlfqLevels: Math.max(1, Math.floor(options.mlfqLevels ?? DEFAULT_MLFQ_LEVELS)),
    algorithms: ALL_ALGORITHMS.filter((a) => algorithms.includes(a)),
  };
  const runs = resolved.algorithms.map((a) => simulateAlgorithm(workload, a, options));
  const totalTicks = runs.reduce(
    (m, r) => Math.max(m, r.timeline[r.timeline.length - 1]?.end ?? 0),
    0,
  );
  return { workload, options: resolved, totalTicks, runs };
}
