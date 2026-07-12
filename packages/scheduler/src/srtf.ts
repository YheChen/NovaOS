import type { ProcessId } from '@novaos/shared';
import type { Scheduler, SchedulableProcess } from './scheduler';
import { byBurst } from './sjf';

/**
 * Preemptive Shortest-Remaining-Time-First.
 *
 * It advertises a 1-tick quantum so the kernel re-picks every tick; on each pick
 * the globally shortest-remaining job (by `estimatedBurst`, which the kernel
 * decrements as a job runs) wins. If the running job is still shortest it is
 * simply re-picked; if a shorter job has arrived it preempts. When the ready
 * queue is empty the kernel's `shouldPreempt` short-circuits (size()===0), so a
 * lone job runs uninterrupted — exactly SRTF semantics. Deterministic; no kernel
 * changes required beyond the shared burst-estimate wiring.
 */
export function createSrtfScheduler(): Scheduler {
  let queue: SchedulableProcess[] = [];
  const contains = (pid: ProcessId): boolean => queue.some((p) => p.pid === pid);

  return {
    id: 'srtf',
    name: 'Shortest Remaining Time First',
    quantumTicks: 1,
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
        schedulerId: 'srtf',
        algorithmName: 'Shortest Remaining Time First',
        quantumTicks: 1,
        readyQueue: [...queue].sort(byBurst).map((p) => p.pid),
        config: { quantumTicks: 1 },
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
