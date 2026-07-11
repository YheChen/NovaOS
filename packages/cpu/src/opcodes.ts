/**
 * The NovaOS instruction set. Instructions are fixed-width 32-bit words:
 * `[ OPCODE(8) | A(8) | B(8) | C(8) ]`.
 *
 * Milestone 1 introduced NOP/MOV/ADD/PRINT/SYSCALL/HALT. Milestone 5 extends the
 * ISA with the register-register arithmetic, comparison, logical, control-flow,
 * stack, and memory instructions the Toy C compiler needs to lower `if`/`while`
 * and functions (see docs/adr/0002-isa-extension-for-toy-c.md).
 *
 * Operand-field conventions for the M5 instructions:
 * - Register operands are register *indices* (0-7 = R0-R7, 8 = SP, 9 = BP).
 * - Control-flow targets (`JMP`/`JZ`/`JNZ`/`CALL`) encode a PC-relative byte
 *   offset as a signed 16-bit value packed into fields B (high) and C (low);
 *   the target address is `pc + offset`. This keeps programs position
 *   independent regardless of where the loader places the code segment.
 * - `LDI` packs an unsigned 16-bit immediate into B (high) and C (low).
 * - `LOAD`/`STORE` use a signed 8-bit displacement in field C.
 *
 * `PRINT` is a temporary M1 convenience instruction superseded by `SYSCALL 0`.
 */
export const Opcode = {
  NOP: 0,
  MOV: 1,
  ADD: 2,
  PRINT: 3,
  SYSCALL: 4,

  // --- Milestone 5 additions -------------------------------------------------
  MOVR: 5, // MOVR dst, src      dst = src (register copy; dst/src may be SP/BP)
  LDI: 6, // LDI  dst, imm16    dst = (B<<8)|C
  SUB: 7, // SUB  dst, a, b     dst = a - b
  MUL: 8, // MUL  dst, a, b     dst = a * b
  DIV: 9, // DIV  dst, a, b     dst = a / b (trap on /0)
  MOD: 10, // MOD  dst, a, b    dst = a % b (trap on %0)
  NEG: 11, // NEG  dst, a       dst = -a
  NOT: 12, // NOT  dst, a       dst = (a == 0) ? 1 : 0

  CEQ: 13, // CEQ  dst, a, b    dst = (a == b) ? 1 : 0
  CNE: 14, // CNE  dst, a, b    dst = (a != b) ? 1 : 0
  CLT: 15, // CLT  dst, a, b    dst = (a <  b) ? 1 : 0
  CLE: 16, // CLE  dst, a, b    dst = (a <= b) ? 1 : 0
  CGT: 17, // CGT  dst, a, b    dst = (a >  b) ? 1 : 0
  CGE: 18, // CGE  dst, a, b    dst = (a >= b) ? 1 : 0
  AND: 19, // AND  dst, a, b    dst = (a && b) ? 1 : 0 (logical)
  OR: 20, // OR   dst, a, b     dst = (a || b) ? 1 : 0 (logical)

  JMP: 21, // JMP  rel16        pc = pc + rel
  JZ: 22, // JZ   reg, rel16    if reg == 0: pc = pc + rel
  JNZ: 23, // JNZ  reg, rel16   if reg != 0: pc = pc + rel

  PUSH: 24, // PUSH reg          sp -= 4; mem[sp] = reg
  POP: 25, // POP  reg          reg = mem[sp]; sp += 4
  CALL: 26, // CALL rel16        push pc+4; pc = pc + rel
  RET: 27, // RET               pc = mem[sp]; sp += 4

  LOAD: 28, // LOAD dst, base, disp8   dst = mem[base + disp]
  STORE: 29, // STORE src, base, disp8  mem[base + disp] = src

  LDIH: 30, // LDIH dst, imm16    dst = ((B<<8)|C) << 16  (load high half of a 32-bit constant)

  BAND: 31, // BAND dst, a, b    dst = a & b   (bitwise)
  BOR: 32, // BOR  dst, a, b     dst = a | b
  BXOR: 33, // BXOR dst, a, b    dst = a ^ b
  SHL: 34, // SHL  dst, a, b     dst = a << (b & 31)
  SHR: 35, // SHR  dst, a, b     dst = a >>> (b & 31)  (logical)

  HALT: 255,
} as const;

export type Opcode = (typeof Opcode)[keyof typeof Opcode];

export const MNEMONICS: Record<Opcode, string> = {
  [Opcode.NOP]: 'NOP',
  [Opcode.MOV]: 'MOV',
  [Opcode.ADD]: 'ADD',
  [Opcode.PRINT]: 'PRINT',
  [Opcode.SYSCALL]: 'SYSCALL',
  [Opcode.MOVR]: 'MOVR',
  [Opcode.LDI]: 'LDI',
  [Opcode.SUB]: 'SUB',
  [Opcode.MUL]: 'MUL',
  [Opcode.DIV]: 'DIV',
  [Opcode.MOD]: 'MOD',
  [Opcode.NEG]: 'NEG',
  [Opcode.NOT]: 'NOT',
  [Opcode.CEQ]: 'CEQ',
  [Opcode.CNE]: 'CNE',
  [Opcode.CLT]: 'CLT',
  [Opcode.CLE]: 'CLE',
  [Opcode.CGT]: 'CGT',
  [Opcode.CGE]: 'CGE',
  [Opcode.AND]: 'AND',
  [Opcode.OR]: 'OR',
  [Opcode.JMP]: 'JMP',
  [Opcode.JZ]: 'JZ',
  [Opcode.JNZ]: 'JNZ',
  [Opcode.PUSH]: 'PUSH',
  [Opcode.POP]: 'POP',
  [Opcode.CALL]: 'CALL',
  [Opcode.RET]: 'RET',
  [Opcode.LOAD]: 'LOAD',
  [Opcode.STORE]: 'STORE',
  [Opcode.LDIH]: 'LDIH',
  [Opcode.BAND]: 'BAND',
  [Opcode.BOR]: 'BOR',
  [Opcode.BXOR]: 'BXOR',
  [Opcode.SHL]: 'SHL',
  [Opcode.SHR]: 'SHR',
  [Opcode.HALT]: 'HALT',
};

/** Instruction width in bytes. */
export const INSTRUCTION_SIZE = 4;

export function isOpcode(value: number): value is Opcode {
  return value in MNEMONICS;
}

/** Pack an opcode and three 8-bit operands into a 32-bit instruction word. */
export function encodeInstruction(opcode: number, a = 0, b = 0, c = 0): number {
  return (((opcode & 0xff) << 24) | ((a & 0xff) << 16) | ((b & 0xff) << 8) | (c & 0xff)) >>> 0;
}
