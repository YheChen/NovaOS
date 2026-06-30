import { describe, it, expect } from 'vitest';
import { lex } from './lexer';
import { parse } from './parser';

describe('shell lexer', () => {
  it('tokenizes a simple command', () => {
    const result = lex('ls -l /home');
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.map((t) => [t.kind, t.value])).toEqual([
      ['word', 'ls'],
      ['flag', '-l'],
      ['word', '/home'],
      ['eof', ''],
    ]);
  });

  it('keeps a quoted string with spaces as one token', () => {
    const result = lex('echo "created hello.asm"');
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value[1]).toMatchObject({
      kind: 'string',
      value: 'created hello.asm',
      quoted: true,
    });
  });

  it('applies escape sequences in double quotes', () => {
    const result = lex('echo "a\\nb"');
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value[1]?.value).toBe('a\nb');
  });

  it('reports an unclosed quote', () => {
    const result = lex('echo "oops');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('Unclosed quote');
  });

  it('recognizes pipe/redirect/semicolon as reserved tokens', () => {
    const result = lex('a | b > c ; d');
    if (!result.ok) throw new Error('expected ok');
    const kinds = result.value.map((t) => t.kind);
    expect(kinds).toContain('pipe');
    expect(kinds).toContain('redirect-output');
    expect(kinds).toContain('semicolon');
  });
});

describe('shell parser', () => {
  it('parses a command with flags and arguments', () => {
    const result = parse('rm -rf demos');
    if (!result.ok) throw new Error(result.error.message);
    const command = result.value.commands[0]!;
    expect(command.name).toBe('rm');
    expect(command.args.map((a) => a.value)).toEqual(['-rf', 'demos']);
  });

  it('rejects pipes with a clear diagnostic', () => {
    const result = parse('ls | cat');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('Pipes');
  });

  it('returns no commands for blank input', () => {
    const result = parse('   ');
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.commands).toHaveLength(0);
  });
});
