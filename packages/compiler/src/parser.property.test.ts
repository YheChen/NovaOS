import { describe, it, expect } from 'vitest';
import { createSeededRandom } from '@novaos/shared';
import { parse } from './parser';

/**
 * Property/fuzz test: the parser must never throw on arbitrary input. Malformed
 * programs must produce diagnostics, not crashes (robust error recovery).
 */
describe('parser (property)', () => {
  const chunks = [
    'int ',
    'main',
    'foo',
    '(',
    ')',
    '{',
    '}',
    ';',
    '=',
    '+',
    '*',
    '5',
    '42',
    'if',
    'else',
    'while',
    'for',
    'return ',
    'print',
    'a',
    'b',
    ' ',
    '\n',
    '==',
    '&&',
    '//x\n',
  ];

  it('never throws and always returns a diagnostics array', () => {
    const rng = createSeededRandom(31337);
    for (let i = 0; i < 500; i += 1) {
      const n = rng.nextInt(0, 40);
      let src = '';
      for (let k = 0; k < n; k += 1) src += chunks[rng.nextInt(0, chunks.length)];
      let result: ReturnType<typeof parse> | null = null;
      expect(() => {
        result = parse(src);
      }).not.toThrow();
      expect(Array.isArray(result!.diagnostics)).toBe(true);
    }
  });
});
