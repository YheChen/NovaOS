import { describe, it, expect } from 'vitest';
import { decode } from './decoder';
import { Opcode, encodeInstruction } from './opcodes';

describe('decode', () => {
  it('round-trips an encoded instruction', () => {
    const word = encodeInstruction(Opcode.ADD, 2, 0, 1);
    const result = decode(word);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      opcode: Opcode.ADD,
      mnemonic: 'ADD',
      a: 2,
      b: 0,
      c: 1,
    });
  });

  it('decodes MOV immediate operands', () => {
    const result = decode(encodeInstruction(Opcode.MOV, 0, 255, 0));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.b).toBe(255);
  });

  it('rejects an unknown opcode with a diagnostic', () => {
    const result = decode(encodeInstruction(0x42, 0, 0, 0));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('cpu/invalid-opcode');
  });
});
