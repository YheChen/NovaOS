import type { FileId } from '@novaos/shared';

/**
 * Connects a Toy C source location to the bytecode it generated. Built by the
 * compiler from the codegen line→span map and the assembler's address↔line map,
 * so the debugger (Milestone 6) can resolve line breakpoints and step by source
 * line.
 */
export interface CompilerSourceMapEntry {
  readonly bytecodeAddress: number;
  readonly generatedInstructionIndex: number;
  readonly generatedAsmLine: number;
  readonly sourceLine: number | null;
  readonly sourceColumn: number | null;
}

export interface CompilerSourceMap {
  readonly version: number;
  readonly fileId?: FileId;
  readonly entries: CompilerSourceMapEntry[];
}

/** The first bytecode address generated for a Toy C source line, or null. */
export function addressForSourceLine(map: CompilerSourceMap, line: number): number | null {
  let best: CompilerSourceMapEntry | null = null;
  for (const entry of map.entries) {
    if (
      entry.sourceLine === line &&
      (best === null || entry.bytecodeAddress < best.bytecodeAddress)
    ) {
      best = entry;
    }
  }
  return best ? best.bytecodeAddress : null;
}

/** The Toy C source line for a bytecode address, or null if unmapped. */
export function sourceLineForAddress(map: CompilerSourceMap, address: number): number | null {
  const entry = map.entries.find((e) => e.bytecodeAddress === address);
  return entry ? entry.sourceLine : null;
}
