/**
 * Structured error model shared across NovaOS. Domain faults, recoverable
 * errors, and fatal invariant violations are all represented as `NovaError`
 * so they can be surfaced uniformly in the UI and timeline.
 */
export type Severity = 'info' | 'warning' | 'recoverable' | 'fatal';

export interface NovaError {
  readonly code: string;
  readonly severity: Severity;
  readonly message: string;
  readonly details?: unknown;
  readonly cause?: unknown;
  /** A short, user-facing suggestion for what to do next. */
  readonly userAction?: string;
}

export function novaError(init: NovaError): NovaError {
  return init;
}

export function isNovaError(value: unknown): value is NovaError {
  if (value === null || typeof value !== 'object') return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.code === 'string' && typeof e.message === 'string' && typeof e.severity === 'string'
  );
}
