import { createQueueScheduler, type Scheduler } from './scheduler';

export interface RoundRobinConfig {
  readonly quantumTicks: number;
}

/**
 * Round Robin. Each process runs for a fixed quantum; when the quantum expires a
 * timer interrupt preempts it and it rotates to the back of the ready queue.
 * Demonstrates fairness and the cost of context switches.
 */
export function createRoundRobinScheduler(config: RoundRobinConfig): Scheduler {
  const quantum = Math.max(1, Math.floor(config.quantumTicks));
  return createQueueScheduler('round-robin', 'Round Robin', quantum);
}
