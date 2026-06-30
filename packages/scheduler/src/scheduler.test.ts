import { describe, it, expect } from 'vitest';
import { processId, asSimTime } from '@novaos/shared';
import { seeded } from '@novaos/testing';
import { createFifoScheduler } from './fifo';
import { createRoundRobinScheduler } from './round-robin';
import type { Scheduler, SchedulableProcess, SchedulingContext } from './scheduler';

const proc = (id: number, arrivalSequence = id): SchedulableProcess => ({
  pid: processId(id),
  priority: 0,
  arrivalSequence,
});

const ctx = (): SchedulingContext => ({
  currentPid: null,
  tick: asSimTime(0),
  random: seeded(1),
});

const factories: Array<[string, () => Scheduler]> = [
  ['FIFO', () => createFifoScheduler()],
  ['Round Robin', () => createRoundRobinScheduler({ quantumTicks: 2 })],
];

// Shared behavior every scheduler must satisfy (spec §16).
describe.each(factories)('Scheduler contract — %s', (_name, make) => {
  it('returns null when empty', () => {
    expect(make().pickNext(ctx())).toBeNull();
  });

  it('selects a single ready process', () => {
    const s = make();
    s.enqueue(proc(1));
    expect(s.pickNext(ctx())).toBe(1);
  });

  it('never selects a removed process', () => {
    const s = make();
    s.enqueue(proc(1));
    s.enqueue(proc(2));
    s.remove(processId(1));
    expect(s.pickNext(ctx())).toBe(2);
  });

  it('is deterministic for identical input', () => {
    const run = () => {
      const s = make();
      [1, 2, 3].forEach((n) => s.enqueue(proc(n)));
      return [s.pickNext(ctx()), s.pickNext(ctx()), s.pickNext(ctx())];
    };
    expect(run()).toEqual(run());
  });

  it('ignores duplicate enqueue of the same pid', () => {
    const s = make();
    s.enqueue(proc(1));
    s.enqueue(proc(1));
    expect(s.size()).toBe(1);
  });

  it('snapshots and restores the ready queue', () => {
    const s = make();
    [1, 2, 3].forEach((n) => s.enqueue(proc(n)));
    const snap = s.snapshot();
    const restored = make();
    restored.restore(snap);
    expect(restored.snapshot().readyQueue).toEqual([1, 2, 3]);
  });
});

describe('FIFO', () => {
  it('preserves admission order and is non-preemptive', () => {
    const s = createFifoScheduler();
    expect(s.quantumTicks).toBeNull();
    [3, 1, 2].forEach((n) => s.enqueue(proc(n)));
    expect([s.pickNext(ctx()), s.pickNext(ctx()), s.pickNext(ctx())]).toEqual([3, 1, 2]);
  });
});

describe('Round Robin', () => {
  it('exposes a quantum', () => {
    expect(createRoundRobinScheduler({ quantumTicks: 4 }).quantumTicks).toBe(4);
  });

  it('rotates preempted processes to the back of the queue', () => {
    const s = createRoundRobinScheduler({ quantumTicks: 2 });
    [1, 2, 3].forEach((n) => s.enqueue(proc(n)));

    const first = s.pickNext(ctx()); // 1 runs
    expect(first).toBe(1);
    s.requeue(proc(1), ctx()); // quantum expired -> 1 to the back

    const second = s.pickNext(ctx()); // 2 runs
    expect(second).toBe(2);
    s.requeue(proc(2), ctx());

    // Queue is now [3, 1, 2]; next pick is 3.
    expect(s.pickNext(ctx())).toBe(3);
  });
});
