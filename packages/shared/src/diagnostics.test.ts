import { describe, it, expect } from 'vitest';
import { diagnostic, hasErrors, countBySeverity, isErrorDiagnostic } from './diagnostics';

describe('diagnostics', () => {
  const warn = diagnostic({ severity: 'warning', code: 'w1', message: 'careful' });
  const oops = diagnostic({ severity: 'error', code: 'e1', message: 'broken', hint: 'fix it' });

  it('detects error severity', () => {
    expect(isErrorDiagnostic(oops)).toBe(true);
    expect(isErrorDiagnostic(warn)).toBe(false);
  });

  it('hasErrors reflects presence of an error diagnostic', () => {
    expect(hasErrors([warn])).toBe(false);
    expect(hasErrors([warn, oops])).toBe(true);
  });

  it('counts by severity', () => {
    expect(countBySeverity([warn, oops, warn])).toEqual({ info: 0, warning: 2, error: 1 });
  });
});
