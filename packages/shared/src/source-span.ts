import type { Brand } from './brand';

/** Identifies a source file within the virtual filesystem. */
export type FileId = Brand<string, 'FileId'>;
export const fileId = (id: string): FileId => id as FileId;

export interface SourcePosition {
  /** 1-based line number. */
  readonly line: number;
  /** 1-based column number. */
  readonly column: number;
  /** 0-based byte/char offset from the start of the file. */
  readonly offset: number;
}

export interface SourceSpan {
  readonly fileId?: FileId;
  readonly start: SourcePosition;
  readonly end: SourcePosition;
}

export interface SourceLocation {
  readonly fileId?: FileId;
  readonly line: number;
  readonly column: number;
}

export function position(line: number, column: number, offset: number): SourcePosition {
  return { line, column, offset };
}

export function span(start: SourcePosition, end: SourcePosition, file?: FileId): SourceSpan {
  return file === undefined ? { start, end } : { fileId: file, start, end };
}

export function locationOf(span: SourceSpan): SourceLocation {
  return span.fileId === undefined
    ? { line: span.start.line, column: span.start.column }
    : { fileId: span.fileId, line: span.start.line, column: span.start.column };
}
