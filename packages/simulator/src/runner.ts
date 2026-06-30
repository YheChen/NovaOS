import { assemble, type BytecodeObject } from '@novaos/assembler';
import { compileToyC } from '@novaos/compiler';
import type { Diagnostic } from '@novaos/shared';
import { createNovaRuntime } from './runtime';

/** A flattened diagnostic for shell rendering (decoupled from the shared type). */
export interface RunnerDiagnostic {
  readonly severity: string;
  readonly message: string;
  readonly line: number | null;
  readonly hint: string | null;
}

export interface CompileReport {
  readonly ok: boolean;
  readonly language: 'assembly' | 'toy-c' | 'unknown';
  readonly instructionCount: number;
  readonly entryPoint: number;
  readonly diagnostics: RunnerDiagnostic[];
}

export interface RunReport {
  readonly ok: boolean;
  readonly output: string;
  readonly exitCode: number | null;
  readonly diagnostics: RunnerDiagnostic[];
}

/**
 * Compiles NovaASM or Toy C source and runs it as a real kernel process. This is
 * the implementation behind the shell's `compile` / `run` commands; it is
 * structurally compatible with the shell's `ProgramRunner` interface.
 */
export interface ProgramRunner {
  compile(path: string, source: string): CompileReport;
  run(path: string, source: string): RunReport;
}

function languageOf(path: string): 'assembly' | 'toy-c' | 'unknown' {
  if (path.endsWith('.asm')) return 'assembly';
  if (path.endsWith('.c')) return 'toy-c';
  return 'unknown';
}

function mapDiagnostic(d: Diagnostic): RunnerDiagnostic {
  return {
    severity: d.severity,
    message: d.message,
    line: d.source ? d.source.line : null,
    hint: d.hint ?? null,
  };
}

interface BuildResult {
  readonly language: 'assembly' | 'toy-c' | 'unknown';
  readonly bytecode: BytecodeObject | null;
  readonly diagnostics: RunnerDiagnostic[];
}

/** Produce bytecode from a source file, dispatching by extension. */
function build(path: string, source: string): BuildResult {
  const language = languageOf(path);
  if (language === 'assembly') {
    const result = assemble(source, { fileName: path });
    return {
      language,
      bytecode: result.success ? result.bytecode : null,
      diagnostics: result.diagnostics.map(mapDiagnostic),
    };
  }
  if (language === 'toy-c') {
    const result = compileToyC(source, { fileName: path });
    return {
      language,
      bytecode: result.success ? result.bytecode : null,
      diagnostics: result.diagnostics.map(mapDiagnostic),
    };
  }
  return {
    language,
    bytecode: null,
    diagnostics: [
      {
        severity: 'error',
        message: `Cannot compile ${path}: only .asm and .c are supported.`,
        line: null,
        hint: null,
      },
    ],
  };
}

export function createProgramRunner(): ProgramRunner {
  return {
    compile(path, source) {
      const built = build(path, source);
      return {
        ok: built.bytecode !== null,
        language: built.language,
        instructionCount: built.bytecode?.instructions.length ?? 0,
        entryPoint: built.bytecode?.entryPoint ?? 0,
        diagnostics: built.diagnostics,
      };
    },

    run(path, source) {
      const built = build(path, source);
      if (!built.bytecode) {
        return { ok: false, output: '', exitCode: null, diagnostics: built.diagnostics };
      }

      const runtime = createNovaRuntime({ scheduler: 'round-robin', quantumTicks: 8 });
      runtime.boot();
      const name = path.split('/').pop() ?? 'program';
      const pid = runtime.spawn(name, {
        entryPoint: built.bytecode.entryPoint,
        code: built.bytecode.code,
      });
      runtime.run();
      const process = runtime.getKernel().getProcess(pid);
      return {
        ok: true,
        output: runtime.getOutput(),
        exitCode: process?.exitCode ?? null,
        diagnostics: built.diagnostics,
      };
    },
  };
}
