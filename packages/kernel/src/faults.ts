/**
 * Kernel faults are broken invariants (more serious than a process fault). A
 * recoverable kernel fault is surfaced as a diagnostic; a fatal one halts the
 * kernel.
 */
export interface KernelFault {
  readonly code: string;
  readonly message: string;
  readonly severity: 'recoverable' | 'fatal';
  readonly tick: number;
  readonly details?: Record<string, unknown>;
}

export function kernelFault(
  code: string,
  message: string,
  severity: 'recoverable' | 'fatal',
  tick: number,
  details?: Record<string, unknown>,
): KernelFault {
  return details === undefined
    ? { code, message, severity, tick }
    : { code, message, severity, tick, details };
}
