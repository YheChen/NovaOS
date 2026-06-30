import type { SourceLocation } from './source-span';

/**
 * Shared diagnostic contract used by the compiler, assembler, shell, and
 * filesystem. Diagnostics are user-facing and educational, not stack traces.
 */
export type DiagnosticSeverity = 'info' | 'warning' | 'error';

export interface RelatedDiagnostic {
  readonly message: string;
  readonly source?: SourceLocation;
}

export interface Diagnostic {
  readonly severity: DiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly source?: SourceLocation;
  readonly hint?: string;
  readonly related?: readonly RelatedDiagnostic[];
}

export function diagnostic(init: Diagnostic): Diagnostic {
  return init;
}

export const isErrorDiagnostic = (d: Diagnostic): boolean => d.severity === 'error';

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some(isErrorDiagnostic);
}

export function countBySeverity(
  diagnostics: readonly Diagnostic[],
): Record<DiagnosticSeverity, number> {
  const counts: Record<DiagnosticSeverity, number> = { info: 0, warning: 0, error: 0 };
  for (const d of diagnostics) counts[d.severity] += 1;
  return counts;
}
