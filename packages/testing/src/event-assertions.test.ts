import { describe, it, expect } from 'vitest';
import { asSimTime } from '@novaos/shared';
import { createTestEventBus } from './test-bus';
import { expectEvents, eventTypes } from './event-assertions';

describe('test event harness', () => {
  it('records published events for assertions', () => {
    const { bus, recorder } = createTestEventBus();
    bus.publish({ type: 'cpu.fetch', tick: asSimTime(0), source: 'cpu', payload: {} });
    bus.publish({ type: 'cpu.exec', tick: asSimTime(1), source: 'cpu', payload: {} });
    expect(eventTypes(recorder.getEvents())).toEqual(['cpu.fetch', 'cpu.exec']);
  });

  it('expectEvents passes on a matching sequence', () => {
    const { bus, recorder } = createTestEventBus();
    bus.publish({ type: 'a', tick: asSimTime(0), source: 'runtime', payload: {} });
    bus.publish({ type: 'b', tick: asSimTime(0), source: 'runtime', payload: {} });
    expect(() => expectEvents(recorder.getEvents()).toEqualSequence(['a', 'b'])).not.toThrow();
  });

  it('expectEvents throws on a mismatched sequence', () => {
    const { bus, recorder } = createTestEventBus();
    bus.publish({ type: 'a', tick: asSimTime(0), source: 'runtime', payload: {} });
    expect(() => expectEvents(recorder.getEvents()).toEqualSequence(['a', 'b'])).toThrow();
  });
});
