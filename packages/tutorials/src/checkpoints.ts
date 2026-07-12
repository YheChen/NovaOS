import type { ProgramRunner } from '@novaos/simulator';
import type { Checkpoint } from './types';

/** Thin constructor helpers so the dataset reads cleanly. */
export const expectedOutput = (id: string, description: string, value: string): Checkpoint => ({
  kind: 'expected-output',
  id,
  description,
  value,
});
export const compilesClean = (id: string, description: string): Checkpoint => ({
  kind: 'compiles-clean',
  id,
  description,
});
export const hasDiagnostic = (
  id: string,
  description: string,
  severity: 'error' | 'warning' | 'info',
): Checkpoint => ({ kind: 'has-diagnostic', id, description, severity });

export interface CheckpointResult {
  readonly checkpointId: string;
  readonly passed: boolean;
  readonly detail: string;
}

export interface VerifyContext {
  readonly runner: ProgramRunner;
  readonly fileName: string;
  readonly source: string;
}

/**
 * Verify one checkpoint by driving the real `ProgramRunner`. Pure with respect
 * to the runner (deterministic compile/run), so the integrity test and the web
 * "Check" button call the exact same function — no drift between what the test
 * asserts and what the user sees.
 */
export function verifyCheckpoint(cp: Checkpoint, ctx: VerifyContext): CheckpointResult {
  switch (cp.kind) {
    case 'expected-output': {
      const report = ctx.runner.run(ctx.fileName, ctx.source);
      if (!report.ok) {
        return { checkpointId: cp.id, passed: false, detail: 'Program failed to compile/run.' };
      }
      const got = report.output.trim();
      return {
        checkpointId: cp.id,
        passed: got === cp.value,
        detail: got === cp.value ? `output = ${got}` : `got "${got}", expected "${cp.value}"`,
      };
    }
    case 'compiles-clean': {
      const report = ctx.runner.compile(ctx.fileName, ctx.source);
      const errors = report.diagnostics.filter((d) => d.severity === 'error');
      return {
        checkpointId: cp.id,
        passed: report.ok && errors.length === 0,
        detail: errors.length === 0 ? 'compiled cleanly' : `${errors.length} error(s)`,
      };
    }
    case 'has-diagnostic': {
      const report = ctx.runner.compile(ctx.fileName, ctx.source);
      const matches = report.diagnostics.filter((d) => d.severity === cp.severity);
      return {
        checkpointId: cp.id,
        passed: matches.length > 0,
        detail:
          matches.length > 0
            ? `${matches.length} ${cp.severity} diagnostic(s)`
            : `no ${cp.severity} diagnostic produced`,
      };
    }
  }
}
