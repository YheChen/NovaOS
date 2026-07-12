import type { ProcessId } from '@novaos/shared';
import { processId, createSeededRandom } from '@novaos/shared';

/** One job to be scheduled. All times are integer simulator ticks. */
export interface SimJob {
  readonly pid: ProcessId;
  /** Stable display name, e.g. "J0". */
  readonly label: string;
  /** Tick the job becomes ready (>= 0). */
  readonly arrival: number;
  /** Total CPU ticks the job needs (>= 1). */
  readonly burst: number;
  /** Lower number = higher priority (matches priority.ts semantics). */
  readonly priority: number;
}

/** A named, ordered set of jobs run identically through every algorithm. */
export interface Workload {
  readonly name: string;
  readonly seed: number;
  readonly jobs: readonly SimJob[];
}

export interface WorkloadSpec {
  readonly name?: string;
  readonly count: number;
  readonly seed: number;
  readonly maxArrival: number;
  readonly minBurst: number;
  readonly maxBurst: number;
  readonly maxPriority: number;
}

/** Sort jobs into a canonical (arrival, pid) order so admission is unambiguous. */
function sortJobs(jobs: SimJob[]): SimJob[] {
  return [...jobs].sort((a, b) => a.arrival - b.arrival || Number(a.pid) - Number(b.pid));
}

/**
 * Deterministic workload generator: the same spec (including seed) always yields
 * byte-identical jobs. Uses only the seeded PRNG — no wall-clock, no global RNG.
 */
export function generateWorkload(spec: WorkloadSpec): Workload {
  const count = Math.max(1, Math.floor(spec.count));
  const minBurst = Math.max(1, Math.floor(spec.minBurst));
  const maxBurst = Math.max(minBurst, Math.floor(spec.maxBurst));
  const maxArrival = Math.max(0, Math.floor(spec.maxArrival));
  const maxPriority = Math.max(0, Math.floor(spec.maxPriority));
  const rng = createSeededRandom(spec.seed);

  const jobs: SimJob[] = [];
  for (let i = 0; i < count; i += 1) {
    jobs.push({
      pid: processId(i),
      label: `J${i}`,
      arrival: rng.nextInt(0, maxArrival + 1),
      burst: rng.nextInt(minBurst, maxBurst + 1),
      priority: rng.nextInt(0, maxPriority + 1),
    });
  }
  return { name: spec.name ?? `Workload#${spec.seed}`, seed: spec.seed, jobs: sortJobs(jobs) };
}

/** Build a preset workload from a compact tuple list `[arrival, burst, priority]`. */
function preset(name: string, rows: ReadonlyArray<readonly [number, number, number]>): Workload {
  const jobs = rows.map(([arrival, burst, priority], i): SimJob => ({
    pid: processId(i),
    label: `J${i}`,
    arrival,
    burst,
    priority,
  }));
  return { name, seed: 0, jobs: sortJobs(jobs) };
}

/**
 * Hand-crafted demo workloads for the UI dropdown, each chosen to make a
 * scheduling trade-off obvious.
 */
export const PRESET_WORKLOADS: readonly Workload[] = [
  // A long job blocks the short ones under FIFO (the "convoy effect"); SJF/SRTF win.
  preset('Convoy effect', [
    [0, 8, 0],
    [1, 2, 0],
    [1, 1, 0],
    [2, 2, 0],
  ]),
  // Late-arriving high-priority work; shows priority vs FIFO/RR ordering.
  preset('Mixed priority', [
    [0, 4, 3],
    [0, 3, 1],
    [2, 2, 0],
    [4, 3, 2],
  ]),
  // Equal bursts arriving together — round-robin interleaves, FIFO batches.
  preset('Round-robin friendly', [
    [0, 4, 0],
    [0, 4, 0],
    [0, 4, 0],
    [0, 4, 0],
  ]),
  // Staggered arrivals with a mix of long and short bursts.
  preset('Bursty arrivals', [
    [0, 3, 1],
    [1, 6, 2],
    [3, 1, 0],
    [4, 4, 1],
    [5, 2, 0],
  ]),
];

export function presetById(name: string): Workload | undefined {
  return PRESET_WORKLOADS.find((w) => w.name === name);
}
