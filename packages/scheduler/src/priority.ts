import type { ProcessId } from '@novaos/shared';
import type { Scheduler, SchedulableProcess } from './scheduler';

const byPriority = (a: SchedulableProcess, b: SchedulableProcess): number =>
  a.priority - b.priority || a.arrivalSequence - b.arrivalSequence;

/**
 * Non-preemptive priority scheduling: the ready process with the lowest
 * `priority` number runs first (ties broken by admission order). Deterministic.
 */
export function createPriorityScheduler(): Scheduler {
  let queue: SchedulableProcess[] = [];
  const contains = (pid: ProcessId): boolean => queue.some((p) => p.pid === pid);

  return {
    id: 'priority',
    name: 'Priority',
    quantumTicks: null,
    enqueue(process) {
      if (!contains(process.pid)) queue.push(process);
    },
    remove(pid) {
      queue = queue.filter((p) => p.pid !== pid);
    },
    pickNext() {
      const chosen = [...queue].sort(byPriority)[0];
      if (!chosen) return null;
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
        schedulerId: 'priority',
        algorithmName: 'Priority',
        quantumTicks: null,
        readyQueue: [...queue].sort(byPriority).map((p) => p.pid),
        config: {},
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
