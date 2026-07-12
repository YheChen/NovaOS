import type { ProcessId } from '@novaos/shared';
import type { Scheduler, SchedulableProcess, SchedulingContext, MlfqLevelView } from './scheduler';

export interface MlfqConfig {
  /** Number of priority levels. Level 0 = highest priority (shortest quantum). */
  readonly levels: number;
  /**
   * Per-level quantum in ticks, indexed by level. Length MUST equal `levels`.
   * Convention: non-decreasing (short slices on top, long at the bottom), e.g.
   * `[2, 4, 8]`. Each entry is clamped to `>= 1` by the factory.
   */
  readonly quanta: readonly number[];
  /**
   * Every `boostInterval` ticks of simulated time, ALL processes are lifted back
   * to level 0 (starvation avoidance / anti-gaming). `null` disables boosting.
   */
  readonly boostInterval: number | null;
}

export const DEFAULT_MLFQ_CONFIG: MlfqConfig = {
  levels: 3,
  quanta: [2, 4, 8],
  boostInterval: 50,
};

interface ResolvedConfig {
  readonly levels: number;
  readonly quanta: number[];
  readonly boostInterval: number | null;
}

function resolveConfig(config: MlfqConfig): ResolvedConfig {
  const levels = Math.max(1, Math.floor(config.levels));
  if (config.quanta.length !== levels) {
    throw new RangeError(
      `MLFQ config: quanta length (${config.quanta.length}) must equal levels (${levels}).`,
    );
  }
  const quanta = config.quanta.map((q) => Math.max(1, Math.floor(q)));
  const boostInterval =
    config.boostInterval === null ? null : Math.max(1, Math.floor(config.boostInterval));
  return { levels, quanta, boostInterval };
}

/**
 * Multi-Level Feedback Queue.
 *
 * Processes start at level 0 (highest priority, shortest quantum). A process
 * that uses its whole quantum is *demoted* one level (it re-enters via the
 * kernel's timer `requeue` path); a process that blocks/yields early keeps its
 * level (it re-enters via `enqueue`), so interactive jobs stay responsive. A
 * periodic priority boost lifts everyone back to level 0 to prevent starvation.
 *
 * The dynamic per-level quantum is exposed through a `quantumTicks` getter that
 * reflects the level of the most-recently-picked process — the kernel reads it
 * synchronously right after `pickNext`, so no `Scheduler` interface change or
 * kernel edit is needed. Deterministic: no RNG, all time from `context.tick`.
 */
export function createMlfqScheduler(config: MlfqConfig = DEFAULT_MLFQ_CONFIG): Scheduler {
  const { levels, quanta, boostInterval } = resolveConfig(config);

  let queues: SchedulableProcess[][] = Array.from({ length: levels }, () => []);
  const levelOf = new Map<ProcessId, number>();
  let runningLevel: number | null = null;
  let lastBoostTick = 0;
  let lastTick = 0;

  const clampLevel = (lvl: number): number => Math.min(Math.max(0, lvl), levels - 1);
  const inAnyQueue = (pid: ProcessId): boolean => queues.some((q) => q.some((p) => p.pid === pid));

  const currentQuantum = (): number | null => {
    const lvl = runningLevel ?? 0;
    return quanta[lvl] ?? quanta[quanta.length - 1] ?? null;
  };

  const maybeBoost = (now: number): void => {
    if (boostInterval === null) return;
    if (now - lastBoostTick < boostInterval) return;
    // Flatten every level into level 0 in (level, insertion) order — fully
    // deterministic, independent of Map iteration order.
    const flattened: SchedulableProcess[] = [];
    for (let lvl = 0; lvl < levels; lvl += 1) {
      const q = queues[lvl];
      if (!q) continue;
      for (const p of q) {
        flattened.push(p);
        levelOf.set(p.pid, 0);
      }
      queues[lvl] = [];
    }
    queues[0] = flattened;
    lastBoostTick = now;
  };

  const levelViews = (): MlfqLevelView[] => {
    const views: MlfqLevelView[] = [];
    for (let lvl = 0; lvl < levels; lvl += 1) {
      views.push({
        level: lvl,
        quantum: quanta[lvl] ?? 1,
        pids: (queues[lvl] ?? []).map((p) => p.pid),
      });
    }
    return views;
  };

  return {
    id: 'mlfq',
    name: 'Multi-Level Feedback Queue',
    get quantumTicks(): number | null {
      return currentQuantum();
    },
    enqueue(process) {
      if (inAnyQueue(process.pid)) return;
      // New arrivals start at level 0; a process re-admitted after blocking early
      // keeps its recorded level (classic MLFQ "stay put on I/O").
      const level = clampLevel(levelOf.get(process.pid) ?? 0);
      levelOf.set(process.pid, level);
      queues[level]?.push(process);
    },
    remove(pid) {
      for (let lvl = 0; lvl < levels; lvl += 1) {
        const q = queues[lvl];
        if (q) queues[lvl] = q.filter((p) => p.pid !== pid);
      }
      levelOf.delete(pid);
    },
    pickNext(context: SchedulingContext) {
      lastTick = Number(context.tick);
      maybeBoost(lastTick);
      for (let lvl = 0; lvl < levels; lvl += 1) {
        const q = queues[lvl];
        if (!q || q.length === 0) continue;
        const chosen = q.shift();
        if (!chosen) continue;
        runningLevel = lvl;
        return chosen.pid;
      }
      runningLevel = null;
      return null;
    },
    requeue(process) {
      // Reached only via the kernel's quantum-expiry path → demote one level.
      const cur = clampLevel(levelOf.get(process.pid) ?? 0);
      const next = Math.min(cur + 1, levels - 1);
      levelOf.set(process.pid, next);
      if (!inAnyQueue(process.pid)) queues[next]?.push(process);
      runningLevel = null;
    },
    has: (pid) => inAnyQueue(pid),
    size: () => queues.reduce((sum, q) => sum + q.length, 0),
    snapshot() {
      const views = levelViews();
      return {
        schedulerId: 'mlfq',
        algorithmName: 'Multi-Level Feedback Queue',
        quantumTicks: currentQuantum(),
        readyQueue: views.flatMap((v) => v.pids),
        config: { levels, quanta: [...quanta], boostInterval },
        mlfq: {
          levels: views,
          runningLevel,
          boostInterval,
          ticksUntilBoost:
            boostInterval === null ? null : Math.max(0, boostInterval - (lastTick - lastBoostTick)),
        },
      };
    },
    restore(snapshot) {
      queues = Array.from({ length: levels }, () => []);
      levelOf.clear();
      runningLevel = snapshot.mlfq?.runningLevel ?? null;
      lastBoostTick = 0;
      lastTick = 0;
      let seq = 0;
      const place = (pid: ProcessId, level: number): void => {
        const lvl = clampLevel(level);
        levelOf.set(pid, lvl);
        queues[lvl]?.push({ pid, priority: 0, arrivalSequence: seq });
        seq += 1;
      };
      if (snapshot.mlfq) {
        for (const view of snapshot.mlfq.levels) {
          for (const pid of view.pids) place(pid, view.level);
        }
      } else {
        // Legacy snapshot with only a flat readyQueue: everything to level 0.
        for (const pid of snapshot.readyQueue) place(pid, 0);
      }
    },
  };
}
