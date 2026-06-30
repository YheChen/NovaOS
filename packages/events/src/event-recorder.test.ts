import { describe, it, expect } from 'vitest';
import { asSimTime } from '@novaos/shared';
import { createEventBus } from './event-bus';
import { createEventRecorder } from './event-recorder';

const input = (type: string) => ({
  type,
  tick: asSimTime(0),
  source: 'kernel' as const,
  payload: {},
});

describe('EventRecorder', () => {
  it('records every published event in order once attached', () => {
    const bus = createEventBus();
    const recorder = createEventRecorder();
    recorder.attach(bus);

    bus.publish(input('kernel.boot.started'));
    bus.publish(input('kernel.process.created'));
    bus.publish(input('kernel.boot.completed'));

    expect(recorder.count()).toBe(3);
    expect(recorder.getEvents().map((e) => e.type)).toEqual([
      'kernel.boot.started',
      'kernel.process.created',
      'kernel.boot.completed',
    ]);
  });

  it('filters by type', () => {
    const bus = createEventBus();
    const recorder = createEventRecorder();
    recorder.attach(bus);
    bus.publish(input('kernel.a'));
    bus.publish(input('kernel.b'));
    bus.publish(input('kernel.a'));
    expect(recorder.getEventsByType('kernel.a')).toHaveLength(2);
  });

  it('stops recording after detach and can be cleared', () => {
    const bus = createEventBus();
    const recorder = createEventRecorder();
    recorder.attach(bus);
    bus.publish(input('kernel.a'));
    recorder.detach();
    bus.publish(input('kernel.b'));
    expect(recorder.count()).toBe(1);
    recorder.clear();
    expect(recorder.count()).toBe(0);
  });
});
