import { describe, it, expect } from 'vitest';
import { assemble } from '@novaos/assembler';
import { compileToyC, formatIR } from '@novaos/compiler';

/**
 * Golden tests protect the educational artifacts: given the same source, the
 * toolchain must emit byte-for-byte identical, predictable output.
 */
describe('assembler golden — exact bytecode encoding', () => {
  it('encodes a known NovaASM program to fixed little-endian bytes', () => {
    const result = assemble(
      `.global main
main:
  MOV R0, 7
  SYSCALL 0
  HALT
`,
      { fileName: 'g.asm' },
    );
    expect(result.success).toBe(true);
    expect(result.bytecode?.entryPoint).toBe(0);
    // MOV R0,7 -> 0x01000700 ; SYSCALL 0 -> 0x04000000 ; HALT -> 0xFF000000 (LE).
    expect(Array.from(result.bytecode?.code ?? [])).toEqual([
      0x00, 0x07, 0x00, 0x01, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0xff,
    ]);
  });
});

const ACCEPTANCE = `int main() {
  int a = 5;
  int b = 10;
  int c = a + b;
  print(c);
  return 0;
}
`;

describe('compiler golden — deterministic output', () => {
  it('produces byte-identical bytecode for identical source', () => {
    const a = compileToyC(ACCEPTANCE, { fileName: 'hello.c' });
    const b = compileToyC(ACCEPTANCE, { fileName: 'hello.c' });
    expect(a.success && b.success).toBe(true);
    expect(Array.from(a.bytecode?.code ?? [])).toEqual(Array.from(b.bytecode?.code ?? []));
  });

  it('lowers main through the documented calling convention', () => {
    const result = compileToyC(ACCEPTANCE, { fileName: 'hello.c' });
    const asm = result.assembly ?? '';
    expect(asm).toContain('.global _start');
    expect(asm).toContain('CALL main');
    expect(asm).toMatch(/main:\n {2}PUSH BP\n {2}MOVR BP, SP/);
    expect(asm).toContain('SYSCALL 0'); // print(c)
    expect(asm).toMatch(/MOVR SP, BP\n {2}POP BP\n {2}RET/); // epilogue
  });

  it('emits a stable IR shape', () => {
    const ir = compileToyC(ACCEPTANCE, { fileName: 'hello.c' }).ir;
    const text = ir ? formatIR(ir) : '';
    expect(text).toContain('func main() -> int');
    expect(text).toContain('print t');
    expect(text).toMatch(/return t\d+/);
  });
});
