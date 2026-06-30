import { encodeInstruction, INSTRUCTION_SIZE } from '@novaos/cpu';

/** A loadable program image: raw little-endian bytecode plus an entry point. */
export interface ProgramImage {
  readonly entryPoint: number;
  readonly code: Uint8Array;
}

export interface InstructionWord {
  readonly opcode: number;
  readonly a?: number;
  readonly b?: number;
  readonly c?: number;
}

/**
 * Hand-assemble a list of instructions into a `ProgramImage`. This is the M1
 * stand-in for the assembler (which arrives in Milestone 4); tests and examples
 * use it to produce bytecode directly.
 */
export function buildProgram(
  instructions: readonly InstructionWord[],
  entryPoint = 0,
): ProgramImage {
  const code = new Uint8Array(instructions.length * INSTRUCTION_SIZE);
  instructions.forEach((ins, index) => {
    const word = encodeInstruction(ins.opcode, ins.a ?? 0, ins.b ?? 0, ins.c ?? 0);
    const offset = index * INSTRUCTION_SIZE;
    code[offset] = word & 0xff;
    code[offset + 1] = (word >>> 8) & 0xff;
    code[offset + 2] = (word >>> 16) & 0xff;
    code[offset + 3] = (word >>> 24) & 0xff;
  });
  return { entryPoint, code };
}
