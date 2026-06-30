import { describe, it, expect } from 'vitest';
import { assemble } from './assembler';
import { lineForAddress, addressForLine } from './source-map';

// The verbatim Milestone 4 acceptance file.
const HELLO = `.global main

main:
  MOV R0, 5
  MOV R1, 10
  ADD R2, R0, R1
  SYSCALL 0
  HALT
`;

describe('assembler — golden output', () => {
  it('assembles the acceptance file to deterministic bytecode', () => {
    const result = assemble(HELLO, { fileName: 'hello.asm' });
    expect(result.success).toBe(true);
    const bytecode = result.bytecode;
    if (!bytecode) throw new Error('expected bytecode');

    expect(bytecode.magic).toBe('NOVA');
    expect(bytecode.entryPoint).toBe(0);
    expect(bytecode.instructions.map((i) => i.mnemonic)).toEqual([
      'MOV',
      'MOV',
      'ADD',
      'SYSCALL',
      'HALT',
    ]);
    // Golden machine code (little-endian per 32-bit instruction).
    expect(Array.from(bytecode.code)).toEqual([
      0, 5, 0, 1, 0, 10, 1, 1, 1, 0, 2, 2, 0, 0, 0, 4, 0, 0, 0, 255,
    ]);
  });

  it('builds a symbol table with the global entry symbol', () => {
    const result = assemble(HELLO);
    if (!result.bytecode) throw new Error('expected bytecode');
    expect(result.bytecode.symbols.symbols).toEqual([{ name: 'main', address: 0, global: true }]);
  });

  it('produces a source map linking addresses to lines', () => {
    const result = assemble(HELLO, { fileName: 'hello.asm' });
    if (!result.bytecode) throw new Error('expected bytecode');
    const map = result.bytecode.sourceMap;
    expect(map.fileId).toBe('hello.asm');
    expect(lineForAddress(map, 0)).toBe(4); // MOV R0, 5 is on line 4
    expect(lineForAddress(map, 16)).toBe(8); // HALT is on line 8
    expect(addressForLine(map, 7)).toBe(12); // SYSCALL 0 is on line 7 → address 12
  });

  it('is deterministic: two assemblies produce identical bytecode', () => {
    const a = assemble(HELLO, { fileName: 'hello.asm' });
    const b = assemble(HELLO, { fileName: 'hello.asm' });
    expect(Array.from(b.bytecode!.code)).toEqual(Array.from(a.bytecode!.code));
    expect(b.bytecode!.instructions).toEqual(a.bytecode!.instructions);
  });

  it('accepts hex and #-prefixed immediates', () => {
    const result = assemble('MOV R0, 0x2a\nMOV R1, #7\nHALT\n');
    if (!result.bytecode) throw new Error('expected bytecode');
    expect(result.bytecode.instructions[0]?.operandB).toBe(0x2a);
    expect(result.bytecode.instructions[1]?.operandB).toBe(7);
  });
});

describe('assembler — invalid assembly', () => {
  const fails = (source: string, code: string) => {
    const result = assemble(source);
    expect(result.success).toBe(false);
    expect(result.diagnostics.some((d) => d.code === code)).toBe(true);
  };

  it('reports an unknown instruction with a suggestion', () => {
    const result = assemble('MOVE R0, 5\n');
    expect(result.success).toBe(false);
    const diag = result.diagnostics.find((d) => d.code === 'asm/unknown-instruction');
    expect(diag?.hint).toContain('MOV');
  });

  it('rejects an invalid register', () => fails('MOV R9, 5\n', 'asm/operand-kind'));
  it('rejects an out-of-range immediate', () => fails('MOV R0, 300\n', 'asm/immediate-range'));
  it('rejects the wrong operand count', () => fails('ADD R0, R1\n', 'asm/operand-count'));
  it('rejects an undefined global', () => fails('.global missing\nHALT\n', 'asm/undefined-global'));
  it('rejects a duplicate label', () => fails('a:\nHALT\na:\nHALT\n', 'asm/duplicate-label'));
});
