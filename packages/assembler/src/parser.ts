import { diagnostic, type Diagnostic } from '@novaos/shared';
import { tokenize, type AsmToken } from './lexer';
import { parseRegister, parseImmediate } from './isa';
import type { AssemblyOperand, AssemblyStatement } from './ast';

export interface ParseResult {
  readonly statements: AssemblyStatement[];
  readonly diagnostics: Diagnostic[];
}

function operandFromToken(token: AsmToken): AssemblyOperand | Diagnostic {
  const pos = { line: token.line, column: token.column };
  if (token.kind === 'register') {
    const index = parseRegister(token.value);
    if (index === null) {
      return diagnostic({
        severity: 'error',
        code: 'asm/invalid-register',
        message: `Invalid register "${token.value}".`,
        source: { line: token.line, column: token.column },
      });
    }
    return { kind: 'register', name: token.value.toUpperCase(), index, pos };
  }
  if (token.kind === 'immediate') {
    const value = parseImmediate(token.value);
    if (value === null) {
      return diagnostic({
        severity: 'error',
        code: 'asm/invalid-immediate',
        message: `Invalid immediate "${token.value}".`,
        source: { line: token.line, column: token.column },
      });
    }
    return { kind: 'immediate', value, pos };
  }
  // a bare symbol used as an operand is a label reference
  return { kind: 'label-ref', name: token.value, pos };
}

/** Parse NovaASM source into statements plus any structural diagnostics. */
export function parse(source: string): ParseResult {
  const tokens = tokenize(source);
  const statements: AssemblyStatement[] = [];
  const diagnostics: Diagnostic[] = [];

  // Group tokens into lines (split on `eol`, drop `eof`).
  let line: AsmToken[] = [];
  const flush = () => {
    if (line.length > 0) parseLine(line);
    line = [];
  };

  function parseLine(lineTokens: AsmToken[]): void {
    let rest = lineTokens;
    const head = rest[0] as AsmToken;

    if (head.kind === 'label') {
      statements.push({
        kind: 'label',
        name: head.value,
        pos: { line: head.line, column: head.column },
      });
      rest = rest.slice(1);
      if (rest.length === 0) return;
    }

    const first = rest[0] as AsmToken | undefined;
    if (!first) return;

    if (first.kind === 'directive') {
      const args = rest
        .slice(1)
        .filter((t) => t.kind !== 'comma')
        .map((t) => t.value);
      statements.push({
        kind: 'directive',
        name: first.value,
        args,
        pos: { line: first.line, column: first.column },
      });
      return;
    }

    if (first.kind !== 'symbol') {
      diagnostics.push(
        diagnostic({
          severity: 'error',
          code: 'asm/unexpected-token',
          message: `Unexpected token "${first.value}" at start of statement.`,
          source: { line: first.line, column: first.column },
        }),
      );
      return;
    }

    const operands: AssemblyOperand[] = [];
    for (const token of rest.slice(1)) {
      if (token.kind === 'comma') continue;
      const operand = operandFromToken(token);
      if ('severity' in operand) {
        diagnostics.push(operand);
      } else {
        operands.push(operand);
      }
    }
    statements.push({
      kind: 'instruction',
      mnemonic: first.value.toUpperCase(),
      operands,
      pos: { line: first.line, column: first.column },
    });
  }

  for (const token of tokens) {
    if (token.kind === 'eof') {
      flush();
      break;
    }
    if (token.kind === 'eol') {
      flush();
      continue;
    }
    line.push(token);
  }

  return { statements, diagnostics };
}
