import { ok, err, type Result } from '@novaos/shared';
import { lex, type ShellToken } from './lexer';

export interface SourceSpan {
  readonly start: number;
  readonly end: number;
}

export interface ShellArgument {
  readonly raw: string;
  readonly value: string;
  readonly quoted: boolean;
  readonly isFlag: boolean;
  readonly span: SourceSpan;
}

export interface CommandNode {
  readonly kind: 'command';
  readonly name: string;
  readonly args: ShellArgument[];
  readonly span: SourceSpan;
}

export interface CommandLineNode {
  readonly kind: 'command-line';
  readonly commands: CommandNode[];
}

export interface ShellParseError {
  readonly message: string;
  readonly column: number;
  readonly hint?: string;
}

const UNSUPPORTED: Record<string, string> = {
  pipe: 'Pipes (`|`) are not supported in this version.',
  'redirect-output': 'Redirects (`>`) are not supported in this version.',
  'redirect-append': 'Redirects (`>>`) are not supported in this version.',
  'redirect-input': 'Redirects (`<`) are not supported in this version.',
  semicolon: 'Command sequences (`;`) are not supported in this version.',
};

/**
 * Parse a single command line into an AST. The grammar is intentionally small
 * (one command); pipe/redirect/semicolon tokens are recognized but rejected with
 * a clear diagnostic so the architecture is ready for them later.
 */
export function parse(input: string): Result<CommandLineNode, ShellParseError> {
  const lexed = lex(input);
  if (!lexed.ok) {
    return err({ message: lexed.error.message, column: lexed.error.column });
  }
  const tokens = lexed.value;

  const first = tokens[0] as ShellToken;
  if (first.kind === 'eof') {
    return ok({ kind: 'command-line', commands: [] });
  }
  if (first.kind !== 'word') {
    const unsupported = UNSUPPORTED[first.kind];
    if (unsupported) {
      return err({ message: unsupported, column: first.start + 1 });
    }
    return err({ message: `Unexpected token "${first.value}".`, column: first.start + 1 });
  }

  const args: ShellArgument[] = [];
  let i = 1;
  for (; i < tokens.length; i += 1) {
    const token = tokens[i] as ShellToken;
    if (token.kind === 'eof') break;
    const unsupported = UNSUPPORTED[token.kind];
    if (unsupported) {
      return err({ message: unsupported, column: token.start + 1 });
    }
    args.push({
      raw: token.value,
      value: token.value,
      quoted: token.quoted,
      isFlag: token.kind === 'flag',
      span: { start: token.start, end: token.end },
    });
  }

  const last = args[args.length - 1];
  const command: CommandNode = {
    kind: 'command',
    name: first.value,
    args,
    span: { start: first.start, end: last ? last.span.end : first.end },
  };
  return ok({ kind: 'command-line', commands: [command] });
}
