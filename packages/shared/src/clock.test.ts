import { describe, it, expect } from 'vitest';
import { createSimulationClock } from './clock';

describe('SimulationClock', () => {
  it('starts at the provided start time', () => {
    expect(createSimulationClock().now()).toBe(0);
    expect(createSimulationClock(100).now()).toBe(100);
  });

  it('advances deterministically by cycles', () => {
    const clock = createSimulationClock();
    expect(clock.tick(4)).toBe(4);
    expect(clock.tick(6)).toBe(10);
    expect(clock.now()).toBe(10);
  });

  it('resets back to the start time', () => {
    const clock = createSimulationClock(5);
    clock.tick(10);
    clock.reset();
    expect(clock.now()).toBe(5);
  });

  it('rejects negative cycles', () => {
    expect(() => createSimulationClock().tick(-1)).toThrow();
  });
});
