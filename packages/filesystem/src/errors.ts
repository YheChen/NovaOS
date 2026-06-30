import type { Result } from '@novaos/shared';
import type { AbsolutePath } from './ids';

export type FsErrorSeverity = 'info' | 'warning' | 'error';

export interface FsError {
  readonly code: string;
  readonly severity: FsErrorSeverity;
  readonly message: string;
  readonly path?: AbsolutePath;
  readonly hint?: string;
}

export type FsResult<T> = Result<T, FsError>;

export function fsError(
  code: string,
  message: string,
  options: { path?: AbsolutePath; hint?: string; severity?: FsErrorSeverity } = {},
): FsError {
  const severity = options.severity ?? 'error';
  return options.path !== undefined && options.hint !== undefined
    ? { code, severity, message, path: options.path, hint: options.hint }
    : options.path !== undefined
      ? { code, severity, message, path: options.path }
      : options.hint !== undefined
        ? { code, severity, message, hint: options.hint }
        : { code, severity, message };
}
