import { describe, it, expect } from 'vitest';
import { asSimTime } from '@novaos/shared';
import { createEventBus } from './event-bus';
import { serializeEvents, deserializeEvents } from './serialization';

describe('event serialization', () => {
  it('round-trips a recorded trace', () => {
    const bus = createEventBus();
    const events = [
      bus.publish({ type: 'cpu.a', tick: asSimTime(0), source: 'cpu', payload: { r: 1 } }),
      bus.publish({ type: 'cpu.b', tick: asSimTime(1), source: 'cpu', payload: { r: 2 } }),
    ];
    const json = serializeEvents(events);
    const result = deserializeEvents(json);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(events);
    }
  });

  it('rejects invalid JSON', () => {
    const result = deserializeEvents('{ not json');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('events/invalid-json');
  });

  it('rejects a non-array trace', () => {
    const result = deserializeEvents('{"type":"cpu.a"}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('events/invalid-trace');
  });

  it('rejects a trace containing a malformed event', () => {
    const result = deserializeEvents('[{"type":"cpu.a"}]');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('events/invalid-event');
  });
});
