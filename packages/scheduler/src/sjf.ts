import type { ProcessId } from '@novaos/shared';
import type { Scheduler, SchedulableProcess } from './scheduler';
import { DEFAULT_ESTIMATED_BURST } from './scheduler';

/**
 * Resolve a process's burst estimate to a positive integer. When the kernel
 * supplies `estimatedBurst` we use it; otherwise we derive a proxy from priority
 * (lower-priority-number == assumed-shorter). Always clamps to `>= 1` so a bad
 * or missing estimate can never produce a zero/negative ranking key.
 */
export function burstOf(p: SchedulableProcess): number {
  const raw = p.estimatedBurst ?? DEFAULT_ESTIMATED_BURST + p.priority;
  return Math.max(1, Math.floor(Number.isFinite(raw) ? raw : DEFAULT_ESTIMATED_BURST));
}

/**
 * Total order over ready processes: shortest burst first, then lower priority
 * number, then admission order. `arrivalSequence` is globally unique, so this is
 * a total order and `[...queue].sort(byBurst)` is fully deterministic.
 */
export const byBurst = (a: SchedulableProcess, b: SchedulableProcess): number =>
  burstOf(a) - burstOf(b) || a.priority - b.priority || a.arrivalSequence - b.arrivalSequence;

/**
 * Non-preemptive Shortest-Job-First: the ready process with the smallest
 * estimated burst runs to completion/block (ties: priority, then arrival).
 * `quantumTicks: null` so the kernel never times it out. Deterministic.
 */
export function createSjfScheduler(): Scheduler {
  let queue: SchedulableProcess[] = [];
  const contains = (pid: ProcessId): boolean => queue.some((p) => p.pid === pid);

  return {
    id: 'sjf',
    name: 'Shortest Job First',
    quantumTicks: null,
    enqueue(process) {
      if (!contains(process.pid)) queue.push(process);
    },
    remove(pid) {
      queue = queue.filter((p) => p.pid !== pid);
    },
    pickNext() {
      const chosen = [...queue].sort(byBurst)[0];
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
        schedulerId: 'sjf',
        algorithmName: 'Shortest Job First',
        quantumTicks: null,
        readyQueue: [...queue].sort(byBurst).map((p) => p.pid),
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
