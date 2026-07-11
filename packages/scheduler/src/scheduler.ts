import type { ProcessId, SimTime, DeterministicRandom } from '@novaos/shared';

export type SchedulerId = 'fifo' | 'round-robin' | 'priority' | 'lottery';

/**
 * The minimal, read-only view of a process the scheduler needs. The kernel owns
 * the full PCB and lifecycle; it admits ready processes to the scheduler and the
 * scheduler only chooses ordering — it never mutates process state (spec §38).
 */
export interface SchedulableProcess {
  readonly pid: ProcessId;
  readonly priority: number;
  /** Deterministic admission order, used to break ties. */
  readonly arrivalSequence: number;
}

export interface SchedulingContext {
  readonly currentPid: ProcessId | null;
  readonly tick: SimTime;
  readonly random: DeterministicRandom;
}

export interface SchedulerSnapshot {
  readonly schedulerId: SchedulerId;
  readonly algorithmName: string;
  /** Round-robin quantum in ticks; `null` for non-preemptive schedulers. */
  readonly quantumTicks: number | null;
  readonly readyQueue: ProcessId[];
  readonly config: Record<string, unknown>;
}

/**
 * A scheduler manages a ready queue. The running process is removed from the
 * queue while it runs (`pickNext`) and put back via `requeue` when preempted.
 */
export interface Scheduler {
  readonly id: SchedulerId;
  readonly name: string;
  /** Round-robin quantum in ticks; `null` = non-preemptive (run until block/exit). */
  readonly quantumTicks: number | null;
  /** Admit a ready process to the back of the queue. */
  enqueue(process: SchedulableProcess): void;
  /** Remove a process from the ready queue entirely (terminated/blocked). */
  remove(pid: ProcessId): void;
  /** Choose and remove the next process to run, or `null` if the queue is empty. */
  pickNext(context: SchedulingContext): ProcessId | null;
  /** Return a preempted process to the ready queue (round-robin rotation). */
  requeue(process: SchedulableProcess, context: SchedulingContext): void;
  has(pid: ProcessId): boolean;
  size(): number;
  snapshot(): SchedulerSnapshot;
  restore(snapshot: SchedulerSnapshot): void;
}

/**
 * Shared ready-queue core used by both FIFO and Round Robin. The two algorithms
 * differ only in their preemption policy (`quantumTicks`): FIFO never preempts,
 * Round Robin preempts after the quantum and rotates the queue.
 */
export function createQueueScheduler(
  id: SchedulerId,
  name: string,
  quantumTicks: number | null,
): Scheduler {
  let queue: SchedulableProcess[] = [];

  return {
    id,
    name,
    quantumTicks,
    enqueue(process) {
      if (queue.some((p) => p.pid === process.pid)) return;
      queue.push(process);
    },
    remove(pid) {
      queue = queue.filter((p) => p.pid !== pid);
    },
    pickNext() {
      const next = queue.shift();
      return next ? next.pid : null;
    },
    requeue(process) {
      if (queue.some((p) => p.pid === process.pid)) return;
      queue.push(process);
    },
    has(pid) {
      return queue.some((p) => p.pid === pid);
    },
    size() {
      return queue.length;
    },
    snapshot() {
      return {
        schedulerId: id,
        algorithmName: name,
        quantumTicks,
        readyQueue: queue.map((p) => p.pid),
        config: quantumTicks === null ? {} : { quantumTicks },
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
