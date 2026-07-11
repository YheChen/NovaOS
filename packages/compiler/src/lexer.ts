import { diagnostic, type Diagnostic, type FileId, type SourcePosition } from '@novaos/shared';
import { KEYWORDS, OPERATORS, PUNCTUATION, type Token } from './tokens';

export interface LexResult {
  readonly tokens: Token[];
  /** Comment tokens, kept separate for educational display (parser ignores them). */
  readonly comments: Token[];
  readonly diagnostics: Diagnostic[];
}

const isDigit = (ch: string): boolean => ch >= '0' && ch <= '9';
const isAlpha = (ch: string): boolean =>
  (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
const isAlphaNum = (ch: string): boolean => isAlpha(ch) || isDigit(ch);

/** The maximum integer literal (unsigned 32-bit; composed via LDI + LDIH + ADD). */
export const MAX_INT_LITERAL = 4294967295;

/** Tokenize Toy C source, preserving source spans for diagnostics and source maps. */
export function lex(source: string, fileId?: FileId): LexResult {
  const tokens: Token[] = [];
  const comments: Token[] = [];
  const diagnostics: Diagnostic[] = [];

  let offset = 0;
  let line = 1;
  let column = 1;

  const pos = (): SourcePosition => ({ line, column, offset });
  const span = (start: SourcePosition) =>
    fileId === undefined ? { start, end: pos() } : { fileId, start, end: pos() };

  const advance = (): string => {
    const ch = source.charAt(offset);
    offset += 1;
    if (ch === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
    return ch;
  };

  const peek = (ahead = 0): string => source.charAt(offset + ahead);

  while (offset < source.length) {
    const ch = peek();

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      advance();
      continue;
    }

    const start = pos();

    // Line comment
    if (ch === '/' && peek(1) === '/') {
      let text = '';
      while (offset < source.length && peek() !== '\n') text += advance();
      comments.push({ kind: 'comment', lexeme: text, span: span(start) });
      continue;
    }

    // Block comment
    if (ch === '/' && peek(1) === '*') {
      let text = advance() + advance(); // consume '/*'
      let closed = false;
      while (offset < source.length) {
        if (peek() === '*' && peek(1) === '/') {
          text += advance() + advance();
          closed = true;
          break;
        }
        text += advance();
      }
      if (!closed) {
        diagnostics.push(
          diagnostic({
            severity: 'error',
            code: 'lex/unterminated-comment',
            message: 'Unterminated block comment.',
            source: { line: start.line, column: start.column },
            hint: 'Add a closing `*/`.',
          }),
        );
      }
      comments.push({ kind: 'comment', lexeme: text, span: span(start) });
      continue;
    }

    // Integer literal
    if (isDigit(ch)) {
      let text = '';
      while (offset < source.length && isDigit(peek())) text += advance();
      const value = Number.parseInt(text, 10);
      if (value > MAX_INT_LITERAL) {
        diagnostics.push(
          diagnostic({
            severity: 'error',
            code: 'lex/integer-out-of-range',
            message: `Integer literal ${text} exceeds the Version 1 maximum of ${MAX_INT_LITERAL}.`,
            source: { line: start.line, column: start.column },
          }),
        );
      }
      tokens.push({ kind: 'integer', lexeme: text, value, span: span(start) });
      continue;
    }

    // Identifier or keyword
    if (isAlpha(ch)) {
      let text = '';
      while (offset < source.length && isAlphaNum(peek())) text += advance();
      tokens.push({
        kind: KEYWORDS.has(text) ? 'keyword' : 'identifier',
        lexeme: text,
        span: span(start),
      });
      continue;
    }

    // Operator (longest match first)
    const op = OPERATORS.find((candidate) => source.startsWith(candidate, offset));
    if (op) {
      for (let i = 0; i < op.length; i += 1) advance();
      tokens.push({ kind: 'operator', lexeme: op, span: span(start) });
      continue;
    }

    // Punctuation
    if (PUNCTUATION.has(ch)) {
      advance();
      tokens.push({ kind: 'punctuation', lexeme: ch, span: span(start) });
      continue;
    }

    // Unknown character
    advance();
    diagnostics.push(
      diagnostic({
        severity: 'error',
        code: 'lex/unknown-character',
        message: `Unknown character ${JSON.stringify(ch)}.`,
        source: { line: start.line, column: start.column },
      }),
    );
  }

  tokens.push({ kind: 'eof', lexeme: '', span: span(pos()) });
  return { tokens, comments, diagnostics };
}
