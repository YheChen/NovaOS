/**
 * The source-map skeleton connecting bytecode addresses to NovaASM source lines.
 * Milestone 6's debugger uses these helpers to resolve breakpoints and the
 * current line; for now they map instruction address ↔ source location.
 */
export interface SourceMapEntry {
  readonly address: number;
  readonly line: number;
  readonly column: number;
}

export interface SourceMap {
  readonly version: number;
  readonly fileId?: string;
  readonly entries: SourceMapEntry[];
}

/** The source line for a bytecode address, or null if unmapped. */
export function lineForAddress(map: SourceMap, address: number): number | null {
  const entry = map.entries.find((e) => e.address === address);
  return entry ? entry.line : null;
}

/** The first bytecode address generated for a source line, or null. */
export function addressForLine(map: SourceMap, line: number): number | null {
  const entry = map.entries.find((e) => e.line === line);
  return entry ? entry.address : null;
}
