import type { SourceSpan } from '@novaos/shared';

export type TokenKind =
  'identifier' | 'integer' | 'keyword' | 'operator' | 'punctuation' | 'comment' | 'eof';

export interface Token {
  readonly kind: TokenKind;
  readonly lexeme: string;
  readonly value?: number;
  readonly span: SourceSpan;
}

export const KEYWORDS = new Set([
  'int',
  'bool',
  'void',
  'if',
  'else',
  'while',
  'for',
  'return',
  'true',
  'false',
  'print',
]);

/** Multi-character operators, checked longest-first by the lexer. */
export const OPERATORS = [
  '==',
  '!=',
  '<=',
  '>=',
  '&&',
  '||',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '+',
  '-',
  '*',
  '/',
  '%',
  '=',
  '<',
  '>',
  '!',
] as const;

export const PUNCTUATION = new Set(['(', ')', '{', '}', ',', ';']);
