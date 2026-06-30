import { encodeInstruction, INSTRUCTION_SIZE } from '@novaos/cpu';
import type { SourceMap } from './source-map';

export interface SymbolEntry {
  readonly name: string;
  readonly address: number;
  readonly global: boolean;
}

export interface SymbolTableSnapshot {
  readonly symbols: SymbolEntry[];
}

export interface EncodedInstruction {
  readonly address: number;
  readonly opcode: number;
  readonly mnemonic: string;
  readonly operandA: number;
  readonly operandB: number;
  readonly operandC: number;
  readonly line: number;
}

export interface BytecodeObject {
  readonly magic: 'NOVA';
  readonly version: number;
  readonly entryPoint: number;
  readonly instructions: EncodedInstruction[];
  /** Flattened little-endian machine code, ready to load into memory. */
  readonly code: Uint8Array;
  readonly data: Uint8Array;
  readonly symbols: SymbolTableSnapshot;
  readonly sourceMap: SourceMap;
  readonly createdBy: string;
  readonly sourceLanguage: 'assembly';
}

/** Flatten encoded instructions into little-endian machine code. */
export function toCodeBytes(instructions: readonly EncodedInstruction[]): Uint8Array {
  const code = new Uint8Array(instructions.length * INSTRUCTION_SIZE);
  instructions.forEach((instruction, index) => {
    const word = encodeInstruction(
      instruction.opcode,
      instruction.operandA,
      instruction.operandB,
      instruction.operandC,
    );
    const offset = index * INSTRUCTION_SIZE;
    code[offset] = word & 0xff;
    code[offset + 1] = (word >>> 8) & 0xff;
    code[offset + 2] = (word >>> 16) & 0xff;
    code[offset + 3] = (word >>> 24) & 0xff;
  });
  return code;
}
