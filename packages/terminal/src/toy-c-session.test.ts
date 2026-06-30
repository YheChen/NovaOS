import { describe, it, expect } from 'vitest';
import { createSimulationClock } from '@novaos/shared';
import { createFileSystem } from '@novaos/filesystem';
import { createShell } from '@novaos/shell';
import { createProgramRunner } from '@novaos/simulator';
import { createTerminalSession } from './session';

/** The flagship demo path: `compile hello.c` then `run hello.c` from the shell. */
function setup() {
  const clock = createSimulationClock();
  const filesystem = createFileSystem({ clock }); // seeds /home/student/hello.c
  const session = createTerminalSession({
    shell: createShell(),
    filesystem,
    clock,
    runner: createProgramRunner(),
  });
  return session;
}

describe('Milestone 5 acceptance — Toy C via the shell', () => {
  it('compiles the seeded hello.c', () => {
    const session = setup();
    session.setInput('compile hello.c');
    const result = session.submit();
    expect(result.exitCode).toBe(0);
    const text = result.output.map((l) => l.text).join('\n');
    expect(text).toContain('Compiled hello.c');
  });

  it('runs hello.c and prints 15', () => {
    const session = setup();
    session.setInput('run hello.c');
    const result = session.submit();
    expect(result.exitCode).toBe(0);
    expect(result.output.some((l) => l.kind === 'stdout' && l.text === '15')).toBe(true);
  });
});
