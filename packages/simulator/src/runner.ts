import { assemble } from '@novaos/assembler';
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
  readonly language: 'assembly' | 'unknown';
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
 * Compiles NovaASM source and runs it as a real kernel process. This is the
 * implementation behind the shell's `compile` / `run` commands; it is structurally
 * compatible with the shell's `ProgramRunner` interface (no shell import needed).
 */
export interface ProgramRunner {
  compile(path: string, source: string): CompileReport;
  run(path: string, source: string): RunReport;
}

function isAssembly(path: string): boolean {
  return path.endsWith('.asm');
}

function mapDiagnostic(d: {
  severity: string;
  message: string;
  source?: { line: number };
  hint?: string;
}): RunnerDiagnostic {
  return {
    severity: d.severity,
    message: d.message,
    line: d.source ? d.source.line : null,
    hint: d.hint ?? null,
  };
}

export function createProgramRunner(): ProgramRunner {
  return {
    compile(path, source) {
      if (!isAssembly(path)) {
        return {
          ok: false,
          language: 'unknown',
          instructionCount: 0,
          entryPoint: 0,
          diagnostics: [
            {
              severity: 'error',
              message: `Cannot compile ${path}: only .asm is supported.`,
              line: null,
              hint: null,
            },
          ],
        };
      }
      const result = assemble(source, { fileName: path });
      return {
        ok: result.success,
        language: 'assembly',
        instructionCount: result.bytecode?.instructions.length ?? 0,
        entryPoint: result.bytecode?.entryPoint ?? 0,
        diagnostics: result.diagnostics.map(mapDiagnostic),
      };
    },

    run(path, source) {
      if (!isAssembly(path)) {
        return {
          ok: false,
          output: '',
          exitCode: null,
          diagnostics: [
            {
              severity: 'error',
              message: `Cannot run ${path}: only .asm is supported.`,
              line: null,
              hint: null,
            },
          ],
        };
      }
      const result = assemble(source, { fileName: path });
      const diagnostics = result.diagnostics.map(mapDiagnostic);
      if (!result.success || !result.bytecode) {
        return { ok: false, output: '', exitCode: null, diagnostics };
      }

      const runtime = createNovaRuntime({ scheduler: 'round-robin', quantumTicks: 8 });
      runtime.boot();
      const name = path.split('/').pop() ?? 'program';
      const pid = runtime.spawn(name, {
        entryPoint: result.bytecode.entryPoint,
        code: result.bytecode.code,
      });
      runtime.run();
      const process = runtime.getKernel().getProcess(pid);
      return {
        ok: true,
        output: runtime.getOutput(),
        exitCode: process?.exitCode ?? null,
        diagnostics,
      };
    },
  };
}
