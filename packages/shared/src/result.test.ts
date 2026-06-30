import { describe, it, expect } from 'vitest';
import { ok, err, isOk, isErr, unwrap, unwrapOr, map, mapErr } from './result';

describe('Result', () => {
  it('constructs Ok and Err with the right discriminant', () => {
    expect(isOk(ok(5))).toBe(true);
    expect(isErr(err('boom'))).toBe(true);
    expect(isOk(err('boom'))).toBe(false);
  });

  it('unwraps Ok and throws on Err', () => {
    expect(unwrap(ok(42))).toBe(42);
    expect(() => unwrap(err('nope'))).toThrow();
  });

  it('unwrapOr returns the fallback for Err', () => {
    expect(unwrapOr(ok(1), 9)).toBe(1);
    expect(unwrapOr(err('x') as ReturnType<typeof err<string>>, 9)).toBe(9);
  });

  it('maps the value channel only', () => {
    expect(map(ok(2), (n) => n * 10)).toEqual(ok(20));
    const e = err('bad');
    expect(map(e, (n: number) => n * 10)).toBe(e);
  });

  it('maps the error channel only', () => {
    expect(mapErr(err('bad'), (m) => `${m}!`)).toEqual(err('bad!'));
    const good = ok(3);
    expect(mapErr(good, (m: string) => m)).toBe(good);
  });
});
