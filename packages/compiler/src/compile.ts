import { hasErrors, type Diagnostic, type FileId, fileId as toFileId } from '@novaos/shared';
import { assemble, type BytecodeObject } from '@novaos/assembler';
import { parse } from './parser';
import { analyze, type SymbolTableSnapshot } from './semantics';
import { generateIR } from './ir-gen';
import { optimize, type OptimizationOptions, type PassReport } from './optimize';
import { generateAssembly } from './codegen';
import type { ProgramNode } from './ast';
import type { IRModule } from './ir';
import type { Token } from './tokens';
import type { CompilerSourceMap, CompilerSourceMapEntry } from './source-map';

export interface CompilationMetrics {
  readonly tokens: number;
  readonly astNodes: number;
  readonly irInstructions: number;
  readonly optimizedIrInstructions: number;
  readonly assemblyLines: number;
  readonly bytecodeInstructions: number;
}

export interface CompilationResult {
  readonly success: boolean;
  readonly sourceFile: string | null;
  readonly tokens: Token[];
  readonly comments: Token[];
  readonly ast: ProgramNode | null;
  readonly symbolTable: SymbolTableSnapshot | null;
  readonly ir: IRModule | null;
  readonly optimizedIr: IRModule | null;
  readonly optimizationPasses: PassReport[];
  readonly assembly: string | null;
  readonly bytecode: BytecodeObject | null;
  readonly sourceMap: CompilerSourceMap | null;
  readonly diagnostics: Diagnostic[];
  readonly metrics: CompilationMetrics;
}

export interface CompileOptions {
  readonly fileName?: string;
  readonly optimize?: OptimizationOptions;
}

function countIRInstructions(module: IRModule | null): number {
  if (!module) return 0;
  return module.functions.reduce(
    (sum, fn) => sum + fn.blocks.reduce((s, b) => s + b.instructions.length + 1, 0),
    0,
  );
}

/**
 * The full Toy C pipeline: lex → parse → analyze → IR → optimize → codegen →
 * assemble. Every stage's artifact is returned for the compiler inspector. The
 * pipeline stops at the first stage that produces error diagnostics, so callers
 * always get as many diagnostics as could be produced safely.
 */
export function compileToyC(source: string, options: CompileOptions = {}): CompilationResult {
  const fid: FileId | undefined = options.fileName ? toFileId(options.fileName) : undefined;
  const sourceFile = options.fileName ?? null;

  const parsed = parse(source, fid);
  const diagnostics: Diagnostic[] = [...parsed.diagnostics];

  const sema = analyze(parsed.program);
  diagnostics.push(...sema.diagnostics);

  const baseMetrics: CompilationMetrics = {
    tokens: parsed.tokens.length,
    astNodes: parsed.program.id, // ids are assigned sequentially from 1
    irInstructions: 0,
    optimizedIrInstructions: 0,
    assemblyLines: 0,
    bytecodeInstructions: 0,
  };

  const fail = (extra: Partial<CompilationResult> = {}): CompilationResult => ({
    success: false,
    sourceFile,
    tokens: parsed.tokens,
    comments: parsed.comments,
    ast: parsed.program,
    symbolTable: sema.symbols,
    ir: null,
    optimizedIr: null,
    optimizationPasses: [],
    assembly: null,
    bytecode: null,
    sourceMap: null,
    diagnostics,
    metrics: baseMetrics,
    ...extra,
  });

  if (hasErrors(diagnostics)) return fail();

  const globalNames = new Set(sema.symbols.globals.map((g) => g.name));
  const ir = generateIR(parsed.program, sema.functions, globalNames);
  diagnostics.push(...ir.diagnostics);
  if (hasErrors(diagnostics)) return fail({ ir });

  const { module: optimizedIr, passes } = optimize(ir, options.optimize);
  const codegen = generateAssembly(optimizedIr);
  diagnostics.push(...codegen.diagnostics);
  if (hasErrors(diagnostics)) {
    return fail({ ir, optimizedIr, optimizationPasses: passes, assembly: codegen.asm });
  }

  const assembled = assemble(codegen.asm, options.fileName ? { fileName: options.fileName } : {});
  diagnostics.push(...assembled.diagnostics);
  if (!assembled.success || !assembled.bytecode) {
    return fail({ ir, optimizedIr, optimizationPasses: passes, assembly: codegen.asm });
  }

  // Build the Toy-C source map by joining codegen line spans with the assembler's
  // address↔asm-line map.
  const entries: CompilerSourceMapEntry[] = assembled.bytecode.instructions.map((enc, index) => {
    const span = codegen.lineSpans[enc.line - 1] ?? null;
    return {
      bytecodeAddress: enc.address,
      generatedInstructionIndex: index,
      generatedAsmLine: enc.line,
      sourceLine: span ? span.start.line : null,
      sourceColumn: span ? span.start.column : null,
    };
  });
  const sourceMap: CompilerSourceMap = fid
    ? { version: 1, fileId: fid, entries }
    : { version: 1, entries };

  return {
    success: true,
    sourceFile,
    tokens: parsed.tokens,
    comments: parsed.comments,
    ast: parsed.program,
    symbolTable: sema.symbols,
    ir,
    optimizedIr,
    optimizationPasses: passes,
    assembly: codegen.asm,
    bytecode: assembled.bytecode,
    sourceMap,
    diagnostics,
    metrics: {
      ...baseMetrics,
      irInstructions: countIRInstructions(ir),
      optimizedIrInstructions: countIRInstructions(optimizedIr),
      assemblyLines: codegen.asm.split('\n').length,
      bytecodeInstructions: assembled.bytecode.instructions.length,
    },
  };
}
