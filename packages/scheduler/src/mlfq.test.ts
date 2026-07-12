import { describe, it, expect } from 'vitest';
import { processId, asSimTime } from '@novaos/shared';
import { seeded } from '@novaos/testing';
import { createMlfqScheduler, DEFAULT_MLFQ_CONFIG } from './mlfq';
import type { SchedulableProcess, SchedulingContext } from './scheduler';

const proc = (id: number, priority = 0, arrivalSequence = id): SchedulableProcess => ({
  pid: processId(id),
  priority,
  arrivalSequence,
});
const ctx = (tick = 0): SchedulingContext => ({
  currentPid: null,
  tick: asSimTime(tick),
  random: seeded(1),
});

describe('MLFQ scheduler', () => {
  it('starts every process at level 0 and reports that quantum', () => {
    const s = createMlfqScheduler({ levels: 3, quanta: [2, 4, 8], boostInterval: null });
    s.enqueue(proc(1));
    s.pickNext(ctx());
    expect(s.quantumTicks).toBe(2); // level-0 quantum
  });

  it('never reports a null quantum (always preemptive)', () => {
    const s = createMlfqScheduler();
    expect(s.quantumTicks).not.toBeNull();
    s.enqueue(proc(1));
    s.pickNext(ctx());
    expect(s.quantumTicks).not.toBeNull();
  });

  it('demotes a process that uses its whole quantum (requeue path)', () => {
    const s = createMlfqScheduler({ levels: 3, quanta: [2, 4, 8], boostInterval: null });
    const p = proc(1);
    s.enqueue(p);
    s.pickNext(ctx()); // runs at level 0
    s.requeue(p, ctx()); // quantum expired → demote to level 1
    s.pickNext(ctx());
    expect(s.quantumTicks).toBe(4); // level-1 quantum
    s.requeue(p, ctx()); // → demote to level 2
    s.pickNext(ctx());
    expect(s.quantumTicks).toBe(8);
    s.requeue(p, ctx()); // saturates at the bottom
    s.pickNext(ctx());
    expect(s.quantumTicks).toBe(8);
  });

  it('does NOT demote a process that blocks early (enqueue path keeps level)', () => {
    const s = createMlfqScheduler({ levels: 3, quanta: [2, 4, 8], boostInterval: null });
    const p = proc(1);
    s.enqueue(p);
    s.pickNext(ctx());
    s.requeue(p, ctx()); // used full quantum → demote to level 1
    s.pickNext(ctx()); // running at level 1 (shifted out of the queue)
    // It blocks before its quantum expires, then wakes: the kernel re-admits the
    // (already-dequeued) running process via enqueue, so its level is preserved.
    s.enqueue(p);
    s.pickNext(ctx());
    expect(s.quantumTicks).toBe(4); // still level 1 — no demotion for blocking early
  });

  it('prefers higher levels: a level-0 job runs before a demoted one', () => {
    const s = createMlfqScheduler({ levels: 3, quanta: [2, 4, 8], boostInterval: null });
    const low = proc(1);
    s.enqueue(low);
    s.pickNext(ctx());
    s.requeue(low, ctx()); // low is now at level 1
    s.enqueue(proc(2)); // fresh arrival at level 0
    expect(Number(s.pickNext(ctx()))).toBe(2); // level 0 wins
    expect(Number(s.pickNext(ctx()))).toBe(1);
  });

  it('boosts all processes back to level 0 after boostInterval', () => {
    const s = createMlfqScheduler({ levels: 3, quanta: [2, 4, 8], boostInterval: 50 });
    const p = proc(1);
    s.enqueue(p);
    s.pickNext(ctx(0));
    s.requeue(p, ctx(0)); // level 1
    s.pickNext(ctx(10));
    s.requeue(p, ctx(10)); // level 2
    // Before the boost window the job is stuck at the bottom.
    s.pickNext(ctx(40));
    expect(s.quantumTicks).toBe(8);
    s.requeue(p, ctx(40));
    // Past the boost interval: the next pick flattens everyone to level 0.
    s.pickNext(ctx(60));
    expect(s.quantumTicks).toBe(2);
  });

  it('avoids starvation: a boosted CPU-bound job is dispatched within each window', () => {
    const s = createMlfqScheduler({ levels: 3, quanta: [2, 4, 8], boostInterval: 20 });
    const hog = proc(1);
    s.enqueue(hog);
    // Sink the hog to the bottom.
    for (let t = 0; t < 3; t += 1) {
      s.pickNext(ctx(t));
      s.requeue(hog, ctx(t));
    }
    // A stream of short interactive jobs keeps arriving at level 0.
    let dispatchedHog = false;
    for (let t = 5; t <= 45 && !dispatchedHog; t += 1) {
      s.enqueue(proc(100 + t)); // short job at level 0
      const picked = s.pickNext(ctx(t));
      if (Number(picked) === 1) dispatchedHog = true;
      else if (picked !== null) s.remove(picked); // short job finishes
    }
    expect(dispatchedHog).toBe(true); // the boost rescued the hog
  });

  it('round-trips through snapshot/restore (structured mlfq view)', () => {
    const s = createMlfqScheduler({ levels: 3, quanta: [2, 4, 8], boostInterval: 50 });
    const p = proc(1);
    s.enqueue(p);
    s.pickNext(ctx());
    s.requeue(p, ctx()); // level 1
    s.enqueue(proc(2)); // level 0
    const snap = s.snapshot();
    expect(snap.mlfq?.levels[0]?.pids.map(Number)).toEqual([2]);
    expect(snap.mlfq?.levels[1]?.pids.map(Number)).toEqual([1]);

    const restored = createMlfqScheduler({ levels: 3, quanta: [2, 4, 8], boostInterval: 50 });
    restored.restore(snap);
    expect(restored.snapshot().mlfq?.levels.map((l) => l.pids.map(Number))).toEqual(
      snap.mlfq?.levels.map((l) => l.pids.map(Number)),
    );
  });

  it('falls back to level 0 for a legacy snapshot without the mlfq field', () => {
    const s = createMlfqScheduler({ levels: 3, quanta: [2, 4, 8], boostInterval: null });
    s.restore({
      schedulerId: 'mlfq',
      algorithmName: 'Multi-Level Feedback Queue',
      quantumTicks: 2,
      readyQueue: [processId(7), processId(8)],
      config: {},
    });
    const snap = s.snapshot();
    expect(snap.mlfq?.levels[0]?.pids.map(Number)).toEqual([7, 8]);
  });

  it('is deterministic and never consults the RNG', () => {
    const build = () => {
      let picks = 0;
      const noRng = {
        ...seeded(1),
        nextInt: () => {
          picks += 1;
          return 0;
        },
      };
      const s = createMlfqScheduler({ levels: 3, quanta: [2, 4, 8], boostInterval: 20 });
      [1, 2, 3].forEach((i) => s.enqueue(proc(i)));
      const order: number[] = [];
      for (let t = 0; t < 6; t += 1) {
        const pid = s.pickNext({ currentPid: null, tick: asSimTime(t), random: noRng });
        if (pid !== null) order.push(Number(pid));
      }
      return { order, picks };
    };
    const a = build();
    const b = build();
    expect(a.order).toEqual(b.order);
    expect(a.picks).toBe(0); // MLFQ is a pure policy — no randomness
  });

  it('validates config: quanta length must equal levels', () => {
    expect(() => createMlfqScheduler({ levels: 3, quanta: [2, 4], boostInterval: null })).toThrow(
      RangeError,
    );
  });

  it('clamps quanta and levels to sane minimums', () => {
    const s = createMlfqScheduler({ levels: 2, quanta: [0, -5], boostInterval: 10 });
    s.enqueue(proc(1));
    s.pickNext(ctx());
    expect(s.quantumTicks).toBe(1); // clamped from 0 to >= 1
  });

  it('ships a sensible default config', () => {
    expect(DEFAULT_MLFQ_CONFIG.levels).toBe(3);
    expect(DEFAULT_MLFQ_CONFIG.quanta).toEqual([2, 4, 8]);
  });
});
