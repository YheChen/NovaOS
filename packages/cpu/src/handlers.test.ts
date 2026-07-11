import { describe, it, expect } from 'vitest';
import { ok } from '@novaos/shared';
import type { Address, Result } from '@novaos/shared';
import { HANDLERS, type HandlerMemory } from './handlers';
import { Opcode, INSTRUCTION_SIZE } from './opcodes';
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

/** A memory stub backed by a map; reads default to 0. */
function memStub(cells: Record<number, number> = {}): HandlerMemory {
  return {
    readWord: (address: Address): Result<number> => ok(cells[address as unknown as number] ?? 0),
  };
}
const MEM = memStub();

describe('instruction handlers', () => {
  it('MOV writes an immediate and sets zero/negative flags', () => {
    const result = HANDLERS[Opcode.MOV](instr(Opcode.MOV, 0, 5), snapshotWith({}), MEM);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.registerWrites).toEqual([{ name: 'r0', value: 5 }]);
    expect(result.value.flags?.zero).toBe(false);
    expect(result.value.flags?.negative).toBe(false);
  });

  it('MOV of 0 sets the zero flag', () => {
    const result = HANDLERS[Opcode.MOV](instr(Opcode.MOV, 0, 0), snapshotWith({}), MEM);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.flags?.zero).toBe(true);
  });

  it('ADD computes the sum', () => {
    const result = HANDLERS[Opcode.ADD](
      instr(Opcode.ADD, 2, 0, 1),
      snapshotWith({ r0: 5, r1: 10 }),
      MEM,
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
      MEM,
    );
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.registerWrites).toEqual([{ name: 'r2', value: 0 }]);
    expect(result.value.flags).toMatchObject({ carry: true, zero: true });
  });

  it('ADD sets overflow and negative on signed overflow', () => {
    const result = HANDLERS[Opcode.ADD](
      instr(Opcode.ADD, 2, 0, 1),
      snapshotWith({ r0: 0x7fffffff, r1: 1 }),
      MEM,
    );
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.registerWrites).toEqual([{ name: 'r2', value: 0x80000000 }]);
    expect(result.value.flags).toMatchObject({ overflow: true, negative: true });
  });

  it('PRINT produces a decimal output effect without writing registers', () => {
    const result = HANDLERS[Opcode.PRINT](instr(Opcode.PRINT, 2), snapshotWith({ r2: 15 }), MEM);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.registerWrites).toEqual([]);
    expect(result.value.output).toEqual({ register: 'r2', value: 15, text: '15\n' });
  });

  it('HALT signals halt', () => {
    const result = HANDLERS[Opcode.HALT](instr(Opcode.HALT), snapshotWith({}), MEM);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.halt).toBe(true);
  });

  it('rejects an invalid register index', () => {
    const result = HANDLERS[Opcode.MOV](instr(Opcode.MOV, 9, 1), snapshotWith({}), MEM);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('cpu/invalid-register');
  });

  // --- Milestone 5 instructions --------------------------------------------

  it('LDI loads a 16-bit immediate from fields B/C', () => {
    const result = HANDLERS[Opcode.LDI](instr(Opcode.LDI, 0, 0x12, 0x34), snapshotWith({}), MEM);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.registerWrites).toEqual([{ name: 'r0', value: 0x1234 }]);
  });

  it('LDIH loads the immediate into the high 16 bits', () => {
    const result = HANDLERS[Opcode.LDIH](instr(Opcode.LDIH, 0, 0x00, 0x01), snapshotWith({}), MEM);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.registerWrites).toEqual([{ name: 'r0', value: 0x00010000 }]);
  });

  it('MOVR copies between registers including SP/BP', () => {
    const result = HANDLERS[Opcode.MOVR](instr(Opcode.MOVR, 9, 8), snapshotWith({ sp: 100 }), MEM);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.registerWrites).toEqual([{ name: 'bp', value: 100 }]);
  });

  it('SUB subtracts and CLT compares signed', () => {
    const sub = HANDLERS[Opcode.SUB](
      instr(Opcode.SUB, 0, 1, 2),
      snapshotWith({ r1: 10, r2: 3 }),
      MEM,
    );
    if (!sub.ok) throw new Error('expected ok');
    expect(sub.value.registerWrites).toEqual([{ name: 'r0', value: 7 }]);

    const clt = HANDLERS[Opcode.CLT](
      instr(Opcode.CLT, 0, 1, 2),
      snapshotWith({ r1: 2, r2: 5 }),
      MEM,
    );
    if (!clt.ok) throw new Error('expected ok');
    expect(clt.value.registerWrites).toEqual([{ name: 'r0', value: 1 }]);
  });

  it('DIV traps on divide-by-zero', () => {
    const result = HANDLERS[Opcode.DIV](
      instr(Opcode.DIV, 0, 1, 2),
      snapshotWith({ r1: 6, r2: 0 }),
      MEM,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('cpu/divide-by-zero');
  });

  it('JMP computes a PC-relative target', () => {
    const result = HANDLERS[Opcode.JMP](instr(Opcode.JMP, 0, 0, 8), snapshotWith({ pc: 16 }), MEM);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.nextPc).toBe(24);
  });

  it('JMP handles negative (signed) offsets', () => {
    // -8 as signed 16-bit = 0xFFF8 -> B=0xFF, C=0xF8
    const result = HANDLERS[Opcode.JMP](
      instr(Opcode.JMP, 0, 0xff, 0xf8),
      snapshotWith({ pc: 32 }),
      MEM,
    );
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.nextPc).toBe(24);
  });

  it('JZ jumps only when the register is zero', () => {
    const taken = HANDLERS[Opcode.JZ](
      instr(Opcode.JZ, 0, 0, 8),
      snapshotWith({ r0: 0, pc: 0 }),
      MEM,
    );
    if (!taken.ok) throw new Error('expected ok');
    expect(taken.value.nextPc).toBe(8);

    const skipped = HANDLERS[Opcode.JZ](
      instr(Opcode.JZ, 0, 0, 8),
      snapshotWith({ r0: 1, pc: 0 }),
      MEM,
    );
    if (!skipped.ok) throw new Error('expected ok');
    expect(skipped.value.nextPc).toBeUndefined();
  });

  it('PUSH decrements SP and writes memory; POP reads and increments SP', () => {
    const push = HANDLERS[Opcode.PUSH](
      instr(Opcode.PUSH, 0),
      snapshotWith({ r0: 42, sp: 100 }),
      MEM,
    );
    if (!push.ok) throw new Error('expected ok');
    expect(push.value.registerWrites).toEqual([{ name: 'sp', value: 96 }]);
    expect(push.value.memoryWrites).toEqual([{ address: 96, value: 42 }]);

    const pop = HANDLERS[Opcode.POP](
      instr(Opcode.POP, 1),
      snapshotWith({ sp: 96 }),
      memStub({ 96: 42 }),
    );
    if (!pop.ok) throw new Error('expected ok');
    expect(pop.value.registerWrites).toEqual([
      { name: 'r1', value: 42 },
      { name: 'sp', value: 100 },
    ]);
  });

  it('CALL pushes the return address and jumps; RET pops it back', () => {
    const call = HANDLERS[Opcode.CALL](
      instr(Opcode.CALL, 0, 0, 12),
      snapshotWith({ pc: 40, sp: 200 }),
      MEM,
    );
    if (!call.ok) throw new Error('expected ok');
    expect(call.value.memoryWrites).toEqual([{ address: 196, value: 40 + INSTRUCTION_SIZE }]);
    expect(call.value.nextPc).toBe(52);

    const ret = HANDLERS[Opcode.RET](
      instr(Opcode.RET),
      snapshotWith({ sp: 196 }),
      memStub({ 196: 44 }),
    );
    if (!ret.ok) throw new Error('expected ok');
    expect(ret.value.nextPc).toBe(44);
    expect(ret.value.registerWrites).toEqual([{ name: 'sp', value: 200 }]);
  });

  it('LOAD/STORE address via base + signed displacement', () => {
    const load = HANDLERS[Opcode.LOAD](
      instr(Opcode.LOAD, 0, 9, 0xfc),
      snapshotWith({ bp: 100 }),
      memStub({ 96: 7 }),
    );
    if (!load.ok) throw new Error('expected ok');
    expect(load.value.registerWrites).toEqual([{ name: 'r0', value: 7 }]); // 0xfc -> -4, mem[96]

    const store = HANDLERS[Opcode.STORE](
      instr(Opcode.STORE, 0, 9, 0xfc),
      snapshotWith({ r0: 9, bp: 100 }),
      MEM,
    );
    if (!store.ok) throw new Error('expected ok');
    expect(store.value.memoryWrites).toEqual([{ address: 96, value: 9 }]);
  });
});
