import { describe, it, expect } from 'vitest';
import { asSimTime } from '@novaos/shared';
import { createEventBus } from './event-bus';
import { ofType, ofSource } from './matchers';
import type { DomainEvent } from './domain-event';

const input = (type: string, value: number) => ({
  type,
  tick: asSimTime(value),
  source: 'cpu' as const,
  payload: { value },
});

describe('EventBus', () => {
  it('assigns deterministic monotonic sequence numbers and ids', () => {
    const bus = createEventBus();
    const a = bus.publish(input('cpu.a', 1));
    const b = bus.publish(input('cpu.b', 2));
    expect([a.sequence, b.sequence]).toEqual([0, 1]);
    expect([a.id, b.id]).toEqual(['evt-0', 'evt-1']);
  });

  it('routes only matching events to subscribers', () => {
    const bus = createEventBus();
    const received: string[] = [];
    bus.subscribe(ofType('cpu.b'), (event) => received.push(event.type));
    bus.publish(input('cpu.a', 1));
    bus.publish(input('cpu.b', 2));
    bus.publish(input('cpu.b', 3));
    expect(received).toEqual(['cpu.b', 'cpu.b']);
  });

  it('stops delivering after unsubscribe', () => {
    const bus = createEventBus();
    let count = 0;
    const off = bus.subscribe(ofSource('cpu'), () => {
      count += 1;
    });
    bus.publish(input('cpu.a', 1));
    off();
    bus.publish(input('cpu.a', 2));
    expect(count).toBe(1);
  });

  it('drain returns buffered events and clears the buffer', () => {
    const bus = createEventBus();
    bus.publish(input('cpu.a', 1));
    bus.publish(input('cpu.b', 2));
    const drained = bus.drain();
    expect(drained.map((e: DomainEvent) => e.type)).toEqual(['cpu.a', 'cpu.b']);
    expect(bus.drain()).toEqual([]);
  });

  it('produces an identical sequence across two independent runs (determinism)', () => {
    const run = () => {
      const bus = createEventBus();
      const out: Array<Pick<DomainEvent, 'id' | 'sequence' | 'type'>> = [];
      for (let i = 0; i < 5; i += 1) {
        const e = bus.publish(input(`cpu.step${i}`, i));
        out.push({ id: e.id, sequence: e.sequence, type: e.type });
      }
      return out;
    };
    expect(run()).toEqual(run());
  });
});
