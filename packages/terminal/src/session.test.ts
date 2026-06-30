import { describe, it, expect } from 'vitest';
import { createSimulationClock } from '@novaos/shared';
import { createFileSystem } from '@novaos/filesystem';
import { createShell } from '@novaos/shell';
import { createTerminalSession } from './session';

function setup() {
  const clock = createSimulationClock();
  const filesystem = createFileSystem({ clock });
  const shell = createShell();
  const session = createTerminalSession({ shell, filesystem, clock });
  return { session, filesystem };
}

describe('TerminalSession — input editing', () => {
  it('inserts, backspaces, and moves the cursor', () => {
    const { session } = setup();
    session.insert('ls');
    expect(session.getInput()).toBe('ls');
    session.backspace();
    expect(session.getInput()).toBe('l');
    session.insert('s');
    expect(session.getInput()).toBe('ls');
    session.moveCursor(-1);
    session.insert('c');
    expect(session.getInput()).toBe('lcs');
    expect(session.getCursor()).toBe(2);
  });
});

describe('TerminalSession — execution', () => {
  it('appends a prompt chunk and command output, then clears input', () => {
    const { session } = setup();
    session.setInput('pwd');
    const result = session.submit();
    expect(result.exitCode).toBe(0);
    const chunks = session.getOutput();
    expect(chunks[0]?.kind).toBe('prompt');
    expect(chunks[chunks.length - 1]?.text).toBe('/home/student');
    expect(session.getInput()).toBe('');
  });

  it('updates cwd when cd succeeds', () => {
    const { session } = setup();
    session.setInput('mkdir demos');
    session.submit();
    session.setInput('cd demos');
    session.submit();
    expect(session.getCwd()).toBe('/home/student/demos');
  });

  it('navigates command history', () => {
    const { session } = setup();
    session.setInput('pwd');
    session.submit();
    session.setInput('ls');
    session.submit();
    session.historyPrev();
    expect(session.getInput()).toBe('ls');
    session.historyPrev();
    expect(session.getInput()).toBe('pwd');
    session.historyNext();
    expect(session.getInput()).toBe('ls');
  });

  it('Ctrl+C interrupts the current line', () => {
    const { session } = setup();
    session.setInput('half typed');
    session.interrupt();
    expect(session.getInput()).toBe('');
    expect(session.getOutput().some((c) => c.text.endsWith('^C'))).toBe(true);
  });

  it('clear empties the output buffer', () => {
    const { session } = setup();
    session.setInput('pwd');
    session.submit();
    session.clear();
    expect(session.getOutput()).toHaveLength(0);
  });

  it('autocomplete applies a unique completion', () => {
    const { session } = setup();
    session.setInput('tou');
    session.complete();
    expect(session.getInput()).toBe('touch');
  });
});
