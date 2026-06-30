import type { BytecodeObject } from '@novaos/assembler';
import type { Diagnostic } from '@novaos/shared';
import type { ProgramNode } from './ast';
import type { CompilationResult } from './compile';
import { formatIR, type IRModule } from './ir';
import type { SymbolTableSnapshot } from './semantics';
import type { Token } from './tokens';

/**
 * The stable, UI-facing view of a compilation. The workspace renders each stage
 * from this snapshot; it must not reach into compiler internals (spec §29).
 */
export interface CompilerInspectorSnapshot {
  readonly tokens: Token[];
  readonly ast: ProgramNode | null;
  readonly symbolTable: SymbolTableSnapshot | null;
  readonly ir: IRModule | null;
  readonly irText: string | null;
  readonly optimizedIr: IRModule | null;
  readonly optimizedIrText: string | null;
  readonly assembly: string | null;
  readonly bytecode: BytecodeObject | null;
  readonly diagnostics: Diagnostic[];
}

export function toInspectorSnapshot(result: CompilationResult): CompilerInspectorSnapshot {
  return {
    tokens: result.tokens,
    ast: result.ast,
    symbolTable: result.symbolTable,
    ir: result.ir,
    irText: result.ir ? formatIR(result.ir) : null,
    optimizedIr: result.optimizedIr,
    optimizedIrText: result.optimizedIr ? formatIR(result.optimizedIr) : null,
    assembly: result.assembly,
    bytecode: result.bytecode,
    diagnostics: result.diagnostics,
  };
}
