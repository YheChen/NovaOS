import { describe, it, expect } from 'vitest';
import { processId, asSimTime } from '@novaos/shared';
import { seeded } from '@novaos/testing';
import { createPriorityScheduler } from './priority';
import { createLotteryScheduler } from './lottery';
import type { SchedulableProcess, SchedulingContext } from './scheduler';

const proc = (id: number, priority = 0, arrivalSequence = id): SchedulableProcess => ({
  pid: processId(id),
  priority,
  arrivalSequence,
});
const ctx = (): SchedulingContext => ({ currentPid: null, tick: asSimTime(0), random: seeded(1) });

describe('priority scheduler', () => {
  it('runs the lowest priority number first', () => {
    const s = createPriorityScheduler();
    s.enqueue(proc(1, 5));
    s.enqueue(proc(2, 1));
    s.enqueue(proc(3, 3));
    const c = ctx();
    expect(Number(s.pickNext(c))).toBe(2);
    expect(Number(s.pickNext(c))).toBe(3);
    expect(Number(s.pickNext(c))).toBe(1);
  });

  it('breaks ties by admission order', () => {
    const s = createPriorityScheduler();
    s.enqueue(proc(10, 2, 2));
    s.enqueue(proc(11, 2, 1));
    expect(Number(s.pickNext(ctx()))).toBe(11);
  });

  it('is non-preemptive', () => {
    expect(createPriorityScheduler().quantumTicks).toBeNull();
  });
});

describe('lottery scheduler', () => {
  const run = () => {
    const s = createLotteryScheduler();
    [1, 2, 3].forEach((i) => s.enqueue(proc(i, 0)));
    const c = ctx();
    const order: number[] = [];
    let pid = s.pickNext(c);
    while (pid !== null) {
      order.push(Number(pid));
      pid = s.pickNext(c);
    }
    return order;
  };

  it('schedules every ready process exactly once', () => {
    const order = run();
    expect(order).toHaveLength(3);
    expect(new Set(order)).toEqual(new Set([1, 2, 3]));
  });

  it('is deterministic across runs with the same seed', () => {
    expect(run()).toEqual(run());
  });

  it('is preemptive (has a quantum)', () => {
    expect(createLotteryScheduler().quantumTicks).not.toBeNull();
  });
});
