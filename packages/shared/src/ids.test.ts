import { describe, it, expect } from 'vitest';
import { createByte, createWord, createAddress, isOk, isErr, BYTE_MAX, WORD_MAX } from './index';

describe('branded value constructors', () => {
  it('accepts in-range bytes', () => {
    expect(isOk(createByte(0))).toBe(true);
    expect(isOk(createByte(BYTE_MAX))).toBe(true);
  });

  it('rejects out-of-range and non-integer bytes', () => {
    expect(isErr(createByte(-1))).toBe(true);
    expect(isErr(createByte(256))).toBe(true);
    expect(isErr(createByte(1.5))).toBe(true);
  });

  it('accepts in-range words and rejects overflow', () => {
    expect(isOk(createWord(WORD_MAX))).toBe(true);
    expect(isErr(createWord(WORD_MAX + 1))).toBe(true);
  });

  it('requires non-negative integer addresses', () => {
    expect(isOk(createAddress(0))).toBe(true);
    expect(isErr(createAddress(-4))).toBe(true);
    expect(isErr(createAddress(3.14))).toBe(true);
  });

  it('returns a structured diagnostic on failure', () => {
    const result = createByte(999);
    if (result.ok) throw new Error('expected error');
    expect(result.error.code).toBe('shared/invalid-byte');
    expect(result.error.severity).toBe('recoverable');
  });
});
