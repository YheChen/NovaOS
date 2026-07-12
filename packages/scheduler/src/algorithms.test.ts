import { describe, it, expect } from 'vitest';
import { processId, asSimTime } from '@novaos/shared';
import { seeded } from '@novaos/testing';
import { createPriorityScheduler } from './priority';
import { createLotteryScheduler } from './lottery';
import { createSjfScheduler, burstOf, byBurst } from './sjf';
import { createSrtfScheduler } from './srtf';
import type { SchedulableProcess, SchedulingContext } from './scheduler';

const proc = (
  id: number,
  priority = 0,
  arrivalSequence = id,
  estimatedBurst?: number,
): SchedulableProcess => ({
  pid: processId(id),
  priority,
  arrivalSequence,
  ...(estimatedBurst !== undefined ? { estimatedBurst } : {}),
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

describe('burstOf / byBurst', () => {
  it('clamps missing, zero, negative, and NaN estimates to >= 1', () => {
    expect(burstOf(proc(1, 0, 0, 0))).toBe(1);
    expect(burstOf(proc(1, 0, 0, -4))).toBe(1);
    expect(burstOf(proc(1, 0, 0, Number.NaN))).toBe(1);
    expect(burstOf(proc(1, 3, 0, 7))).toBe(7);
    // No estimate → priority proxy: DEFAULT_ESTIMATED_BURST(1) + priority.
    expect(burstOf(proc(1, 5))).toBe(6);
  });

  it('is a deterministic total order (shortest burst wins)', () => {
    const items = [proc(3, 0, 3, 4), proc(1, 2, 1, 4), proc(2, 2, 2, 4), proc(4, 0, 4, 1)];
    const a = [...items].sort(byBurst).map((p) => Number(p.pid));
    const b = [...items].sort(byBurst).map((p) => Number(p.pid));
    expect(a).toEqual(b);
    expect(a[0]).toBe(4); // burst 1 beats the burst-4 group
  });
});

describe('SJF scheduler', () => {
  it('runs the shortest estimated burst first', () => {
    const s = createSjfScheduler();
    s.enqueue(proc(1, 0, 1, 10));
    s.enqueue(proc(2, 0, 2, 3));
    s.enqueue(proc(3, 0, 3, 7));
    const c = ctx();
    expect(Number(s.pickNext(c))).toBe(2);
    expect(Number(s.pickNext(c))).toBe(3);
    expect(Number(s.pickNext(c))).toBe(1);
  });

  it('breaks ties by priority, then admission order', () => {
    const s = createSjfScheduler();
    s.enqueue(proc(1, 5, 1, 4));
    s.enqueue(proc(2, 2, 2, 4)); // same burst, lower priority number
    s.enqueue(proc(3, 2, 3, 4)); // same burst + priority, later arrival
    const c = ctx();
    expect(Number(s.pickNext(c))).toBe(2);
    expect(Number(s.pickNext(c))).toBe(3);
    expect(Number(s.pickNext(c))).toBe(1);
  });

  it('falls back to the priority proxy when no estimate is present', () => {
    const s = createSjfScheduler();
    s.enqueue(proc(1, 5));
    s.enqueue(proc(2, 1));
    expect(Number(s.pickNext(ctx()))).toBe(2);
  });

  it('is non-preemptive', () => {
    expect(createSjfScheduler().quantumTicks).toBeNull();
  });

  it('reports the ready queue shortest-first in its snapshot', () => {
    const s = createSjfScheduler();
    s.enqueue(proc(1, 0, 1, 9));
    s.enqueue(proc(2, 0, 2, 2));
    const snap = s.snapshot();
    expect(snap.schedulerId).toBe('sjf');
    expect(snap.readyQueue.map(Number)).toEqual([2, 1]);
  });
});

describe('SRTF scheduler', () => {
  it('advertises a 1-tick quantum so the kernel re-picks every tick', () => {
    expect(createSrtfScheduler().quantumTicks).toBe(1);
  });

  it('always picks the shortest remaining time, preempting when a shorter job arrives', () => {
    const s = createSrtfScheduler();
    s.enqueue(proc(1, 0, 1, 8));
    s.enqueue(proc(2, 0, 2, 2));
    const c = ctx();
    expect(Number(s.pickNext(c))).toBe(2); // shortest of the two
    // Kernel re-admits the long job and a shorter one arrives mid-flight.
    s.enqueue(proc(1, 0, 1, 8));
    s.enqueue(proc(3, 0, 3, 1));
    expect(Number(s.pickNext(c))).toBe(3); // preempts: shortest remaining wins
  });

  it('round-trips through snapshot/restore', () => {
    const s = createSrtfScheduler();
    s.enqueue(proc(1, 0, 1, 5));
    s.enqueue(proc(2, 0, 2, 3));
    const snap = s.snapshot();
    const restored = createSrtfScheduler();
    restored.restore(snap);
    expect(restored.snapshot().readyQueue).toEqual(snap.readyQueue);
  });
});
