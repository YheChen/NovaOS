import { ok, err, type Result } from '@novaos/shared';

export type ShellTokenKind =
  | 'word'
  | 'string'
  | 'flag'
  | 'pipe'
  | 'redirect-output'
  | 'redirect-append'
  | 'redirect-input'
  | 'semicolon'
  | 'eof';

export interface ShellToken {
  readonly kind: ShellTokenKind;
  /** The resolved value (quotes removed, escapes applied). */
  readonly value: string;
  readonly start: number;
  readonly end: number;
  readonly quoted: boolean;
}

export interface ShellLexError {
  readonly message: string;
  readonly column: number;
}

const isWhitespace = (ch: string): boolean => ch === ' ' || ch === '\t';

function readQuoted(
  input: string,
  start: number,
  quote: string,
): Result<{ value: string; end: number }, ShellLexError> {
  let value = '';
  let i = start + 1;
  while (i < input.length) {
    const ch = input[i] as string;
    if (ch === quote) {
      return ok({ value, end: i + 1 });
    }
    if (ch === '\\' && quote === '"') {
      const next = input[i + 1];
      if (next === '"') value += '"';
      else if (next === '\\') value += '\\';
      else if (next === 'n') value += '\n';
      else if (next === 't') value += '\t';
      else value += next ?? '';
      i += 2;
      continue;
    }
    value += ch;
    i += 1;
  }
  return err({ message: `Unclosed quote starting at column ${start + 1}.`, column: start + 1 });
}

/** Tokenize a shell command line, preserving source spans for diagnostics. */
export function lex(input: string): Result<ShellToken[], ShellLexError> {
  const tokens: ShellToken[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i] as string;
    if (isWhitespace(ch)) {
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quoted = readQuoted(input, i, ch);
      if (!quoted.ok) return quoted;
      tokens.push({
        kind: 'string',
        value: quoted.value.value,
        start: i,
        end: quoted.value.end,
        quoted: true,
      });
      i = quoted.value.end;
      continue;
    }
    if (ch === '|') {
      tokens.push({ kind: 'pipe', value: '|', start: i, end: i + 1, quoted: false });
      i += 1;
      continue;
    }
    if (ch === ';') {
      tokens.push({ kind: 'semicolon', value: ';', start: i, end: i + 1, quoted: false });
      i += 1;
      continue;
    }
    if (ch === '<') {
      tokens.push({ kind: 'redirect-input', value: '<', start: i, end: i + 1, quoted: false });
      i += 1;
      continue;
    }
    if (ch === '>') {
      const append = input[i + 1] === '>';
      tokens.push({
        kind: append ? 'redirect-append' : 'redirect-output',
        value: append ? '>>' : '>',
        start: i,
        end: append ? i + 2 : i + 1,
        quoted: false,
      });
      i += append ? 2 : 1;
      continue;
    }
    // bare word / flag
    let j = i;
    let value = '';
    while (j < input.length) {
      const c = input[j] as string;
      if (
        isWhitespace(c) ||
        c === '"' ||
        c === "'" ||
        c === '|' ||
        c === ';' ||
        c === '<' ||
        c === '>'
      ) {
        break;
      }
      value += c;
      j += 1;
    }
    const isFlag = value.startsWith('-') && value.length > 1;
    tokens.push({ kind: isFlag ? 'flag' : 'word', value, start: i, end: j, quoted: false });
    i = j;
  }
  tokens.push({ kind: 'eof', value: '', start: input.length, end: input.length, quoted: false });
  return ok(tokens);
}
