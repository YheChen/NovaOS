import { describe, it, expect } from 'vitest';
import { stableStringify, versioned } from './serialization';

describe('stableStringify', () => {
  it('sorts object keys regardless of insertion order', () => {
    const a = stableStringify({ b: 1, a: 2, c: 3 });
    const b = stableStringify({ c: 3, a: 2, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":2,"b":1,"c":3}');
  });

  it('recurses into nested objects and arrays', () => {
    const out = stableStringify({ z: { y: 1, x: 2 }, a: [{ n: 1, m: 2 }] });
    expect(out).toBe('{"a":[{"m":2,"n":1}],"z":{"x":2,"y":1}}');
  });

  it('preserves array order', () => {
    expect(stableStringify([3, 1, 2])).toBe('[3,1,2]');
  });
});

describe('versioned', () => {
  it('wraps data with a schema version', () => {
    expect(versioned('1.0.0', { count: 1 })).toEqual({
      schemaVersion: '1.0.0',
      data: { count: 1 },
    });
  });
});
