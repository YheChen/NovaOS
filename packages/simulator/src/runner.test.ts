import { describe, it, expect } from 'vitest';
import { createProgramRunner } from './runner';

// Sum 5 + 10 into R0 and print it. (The print syscall reads R0 — see the M4
// report's documented deviation about the spec demo's R2 destination.)
const HELLO = `.global main

main:
  MOV R0, 5
  MOV R1, 10
  ADD R0, R0, R1
  SYSCALL 0
  HALT
`;

describe('ProgramRunner', () => {
  it('compiles a valid .asm file', () => {
    const report = createProgramRunner().compile('hello.asm', HELLO);
    expect(report.ok).toBe(true);
    expect(report.instructionCount).toBe(5);
    expect(report.entryPoint).toBe(0);
  });

  it('runs an assembled program and captures its output', () => {
    const report = createProgramRunner().run('hello.asm', HELLO);
    expect(report.ok).toBe(true);
    expect(report.output).toBe('15\n');
    expect(report.exitCode).toBe(0);
  });

  it('surfaces assembler diagnostics and does not run on error', () => {
    const report = createProgramRunner().run('bad.asm', 'MOVE R0, 5\n');
    expect(report.ok).toBe(false);
    expect(report.output).toBe('');
    expect(report.diagnostics.some((d) => d.severity === 'error')).toBe(true);
  });

  it('rejects non-assembly files', () => {
    const report = createProgramRunner().compile('hello.c', 'int main(){}');
    expect(report.ok).toBe(false);
  });

  it('is deterministic across runs', () => {
    const a = createProgramRunner().run('hello.asm', HELLO);
    const b = createProgramRunner().run('hello.asm', HELLO);
    expect(b.output).toBe(a.output);
  });
});
