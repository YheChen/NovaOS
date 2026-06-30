import { describe, it, expect } from 'vitest';
import { createSimulationClock } from '@novaos/shared';
import { createFileSystem, fsContext, DEFAULT_HOME } from '@novaos/filesystem';
import { createShell } from '@novaos/shell';
import { createProgramRunner } from '@novaos/simulator';
import { createTerminalSession } from './session';

// The acceptance program: sum 5 + 10 into R0 and print it. (`print` reads R0;
// the spec demo's `ADD R2` is adapted to `ADD R0` — see the M4 report.)
const HELLO_ASM = `.global main

main:
  MOV R0, 5
  MOV R1, 10
  ADD R0, R0, R1
  SYSCALL 0
  HALT
`;

function setup() {
  const clock = createSimulationClock();
  const filesystem = createFileSystem({ clock });
  filesystem.writeText('hello.asm', HELLO_ASM, fsContext(DEFAULT_HOME));
  const session = createTerminalSession({
    shell: createShell(),
    filesystem,
    clock,
    runner: createProgramRunner(),
  });
  return { session, filesystem };
}

describe('Milestone 4 acceptance — compile && run', () => {
  it('compiles hello.asm and reports success', () => {
    const { session } = setup();
    session.setInput('compile hello.asm');
    const result = session.submit();
    expect(result.exitCode).toBe(0);
    const text = result.output.map((l) => l.text).join('\n');
    expect(text).toContain('Compiled hello.asm');
    expect(text).toContain('5 instruction(s)');
  });

  it('runs hello.asm and prints 15', () => {
    const { session } = setup();
    session.setInput('run hello.asm');
    const result = session.submit();
    expect(result.exitCode).toBe(0);
    expect(result.output.some((l) => l.kind === 'stdout' && l.text === '15')).toBe(true);
  });

  it('reports a compile error for invalid assembly', () => {
    const { session, filesystem } = setup();
    filesystem.writeText('bad.asm', 'MOVE R0, 5\nHALT\n', fsContext(DEFAULT_HOME));
    session.setInput('compile bad.asm');
    const result = session.submit();
    expect(result.exitCode).toBe(1);
    expect(result.output.some((l) => l.kind === 'diagnostic' && l.text.includes('error'))).toBe(
      true,
    );
  });
});
