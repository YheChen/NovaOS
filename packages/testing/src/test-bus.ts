import { createEventBus, createEventRecorder } from '@novaos/events';
import type { EventBus, EventRecorder } from '@novaos/events';

export interface TestEventHarness {
  readonly bus: EventBus;
  readonly recorder: EventRecorder;
}

/**
 * Create an event bus with an attached recorder, so tests can publish events and
 * then assert on the recorded trace.
 */
export function createTestEventBus(): TestEventHarness {
  const bus = createEventBus();
  const recorder = createEventRecorder();
  recorder.attach(bus);
  return { bus, recorder };
}
