import { describe, it, expect } from 'vitest';
import { HANDLERS } from './handlers';
import { Opcode } from './opcodes';
import { createRegisterFile } from './register-file';
import type { DecodedInstruction } from './instruction';

const instr = (opcode: Opcode, a = 0, b = 0, c = 0): DecodedInstruction => ({
  opcode,
  mnemonic: 'TEST',
  a,
  b,
  c,
  raw: 0,
});

const snapshotWith = (writes: Record<string, number>) => {
  const rf = createRegisterFile();
  for (const [name, value] of Object.entries(writes)) {
    rf.set(name as 'r0', value);
  }
  return rf.snapshot();
};

describe('instruction handlers', () => {
  it('MOV writes an immediate and sets zero/negative flags', () => {
    const result = HANDLERS[Opcode.MOV](instr(Opcode.MOV, 0, 5), snapshotWith({}));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.registerWrites).toEqual([{ name: 'r0', value: 5 }]);
    expect(result.value.flags?.zero).toBe(false);
    expect(result.value.flags?.negative).toBe(false);
  });

  it('MOV of 0 sets the zero flag', () => {
    const result = HANDLERS[Opcode.MOV](instr(Opcode.MOV, 0, 0), snapshotWith({}));
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.flags?.zero).toBe(true);
  });

  it('ADD computes the sum', () => {
    const result = HANDLERS[Opcode.ADD](
      instr(Opcode.ADD, 2, 0, 1),
      snapshotWith({ r0: 5, r1: 10 }),
    );
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.registerWrites).toEqual([{ name: 'r2', value: 15 }]);
    expect(result.value.flags).toMatchObject({
      zero: false,
      negative: false,
      carry: false,
      overflow: false,
    });
  });

  it('ADD sets carry and zero on unsigned wrap-around', () => {
    const result = HANDLERS[Opcode.ADD](
      instr(Opcode.ADD, 2, 0, 1),
      snapshotWith({ r0: 0xffffffff, r1: 1 }),
    );
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.registerWrites).toEqual([{ name: 'r2', value: 0 }]);
    expect(result.value.flags).toMatchObject({ carry: true, zero: true });
  });

  it('ADD sets overflow and negative on signed overflow', () => {
    const result = HANDLERS[Opcode.ADD](
      instr(Opcode.ADD, 2, 0, 1),
      snapshotWith({ r0: 0x7fffffff, r1: 1 }),
    );
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.registerWrites).toEqual([{ name: 'r2', value: 0x80000000 }]);
    expect(result.value.flags).toMatchObject({ overflow: true, negative: true });
  });

  it('PRINT produces a decimal output effect without writing registers', () => {
    const result = HANDLERS[Opcode.PRINT](instr(Opcode.PRINT, 2), snapshotWith({ r2: 15 }));
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.registerWrites).toEqual([]);
    expect(result.value.output).toEqual({ register: 'r2', value: 15, text: '15\n' });
  });

  it('HALT signals halt', () => {
    const result = HANDLERS[Opcode.HALT](instr(Opcode.HALT), snapshotWith({}));
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.halt).toBe(true);
  });

  it('rejects an invalid register index', () => {
    const result = HANDLERS[Opcode.MOV](instr(Opcode.MOV, 9, 1), snapshotWith({}));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('cpu/invalid-register');
  });
});
