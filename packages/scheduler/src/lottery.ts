import type { ProcessId } from '@novaos/shared';
import type { Scheduler, SchedulableProcess, SchedulingContext } from './scheduler';

export interface LotteryConfig {
  readonly quantumTicks?: number;
}

/** Tickets per process: a lower `priority` number wins more tickets. */
const ticketsFor = (p: SchedulableProcess): number => Math.max(1, 8 - p.priority);

/**
 * Lottery scheduling: each pick draws a weighted random ticket using the
 * injected seeded PRNG, so it is fully deterministic for a given seed. Preemptive
 * (re-runs the lottery every quantum).
 */
export function createLotteryScheduler(config: LotteryConfig = {}): Scheduler {
  const quantumTicks = config.quantumTicks ?? 4;
  let queue: SchedulableProcess[] = [];
  const contains = (pid: ProcessId): boolean => queue.some((p) => p.pid === pid);

  return {
    id: 'lottery',
    name: 'Lottery',
    quantumTicks,
    enqueue(process) {
      if (!contains(process.pid)) queue.push(process);
    },
    remove(pid) {
      queue = queue.filter((p) => p.pid !== pid);
    },
    pickNext(context: SchedulingContext) {
      if (queue.length === 0) return null;
      const total = queue.reduce((sum, p) => sum + ticketsFor(p), 0);
      let draw = context.random.nextInt(0, total);
      let chosen = queue[0] as SchedulableProcess;
      for (const p of queue) {
        draw -= ticketsFor(p);
        if (draw < 0) {
          chosen = p;
          break;
        }
      }
      queue = queue.filter((p) => p.pid !== chosen.pid);
      return chosen.pid;
    },
    requeue(process) {
      if (!contains(process.pid)) queue.push(process);
    },
    has: contains,
    size: () => queue.length,
    snapshot() {
      return {
        schedulerId: 'lottery',
        algorithmName: 'Lottery',
        quantumTicks,
        readyQueue: queue.map((p) => p.pid),
        config: { quantumTicks },
      };
    },
    restore(snapshot) {
      queue = snapshot.readyQueue.map((pid, index) => ({
        pid,
        priority: 0,
        arrivalSequence: index,
      }));
    },
  };
}
