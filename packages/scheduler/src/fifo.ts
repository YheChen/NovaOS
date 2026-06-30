import { createQueueScheduler, type Scheduler } from './scheduler';

/**
 * First-Come-First-Served. Non-preemptive: a process runs until it exits or
 * blocks. Demonstrates the convoy effect.
 */
export function createFifoScheduler(): Scheduler {
  return createQueueScheduler('fifo', 'First Come First Served', null);
}
