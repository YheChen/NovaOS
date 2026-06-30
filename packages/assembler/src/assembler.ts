import { diagnostic, type Diagnostic } from '@novaos/shared';
import { INSTRUCTION_SPECS, KNOWN_MNEMONICS, SUPPORTED_DIRECTIVES } from './isa';
import { parse } from './parser';
import type { InstructionStatement } from './ast';
import {
  toCodeBytes,
  type BytecodeObject,
  type EncodedInstruction,
  type SymbolEntry,
} from './bytecode';
import type { SourceMap, SourceMapEntry } from './source-map';

export interface AssembleOptions {
  readonly fileName?: string;
}

export interface AssembleResult {
  readonly success: boolean;
  readonly bytecode: BytecodeObject | null;
  readonly diagnostics: Diagnostic[];
}

const BYTECODE_VERSION = 1;
const INSTRUCTION_BYTES = 4;

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) (dp[i] as number[])[0] = i;
  for (let j = 0; j <= b.length; j += 1) (dp[0] as number[])[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      (dp[i] as number[])[j] = Math.min(
        (dp[i - 1] as number[])[j]! + 1,
        (dp[i] as number[])[j - 1]! + 1,
        (dp[i - 1] as number[])[j - 1]! + cost,
      );
    }
  }
  return (dp[a.length] as number[])[b.length]!;
}

function suggestMnemonic(word: string): string | null {
  let best: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of KNOWN_MNEMONICS) {
    const distance = editDistance(word, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return bestDistance <= 2 ? best : null;
}

/** Assemble NovaASM source into a deterministic bytecode object. */
export function assemble(source: string, options: AssembleOptions = {}): AssembleResult {
  const { statements, diagnostics } = parse(source);

  // Pass 1: assign addresses and collect symbols.
  let address = 0;
  const symbols = new Map<string, number>();
  const globals = new Set<string>();
  const instructions: Array<{ stmt: InstructionStatement; address: number }> = [];

  for (const statement of statements) {
    if (statement.kind === 'label') {
      if (symbols.has(statement.name)) {
        diagnostics.push(
          diagnostic({
            severity: 'error',
            code: 'asm/duplicate-label',
            message: `Duplicate label "${statement.name}".`,
            source: { line: statement.pos.line, column: statement.pos.column },
          }),
        );
      } else {
        symbols.set(statement.name, address);
      }
    } else if (statement.kind === 'directive') {
      if (statement.name === '.global') {
        const target = statement.args[0];
        if (target === undefined) {
          diagnostics.push(
            diagnostic({
              severity: 'error',
              code: 'asm/directive-arg',
              message: '`.global` requires a symbol name.',
              source: { line: statement.pos.line, column: statement.pos.column },
            }),
          );
        } else {
          globals.add(target);
        }
      } else if (
        !SUPPORTED_DIRECTIVES.includes(statement.name as (typeof SUPPORTED_DIRECTIVES)[number])
      ) {
        diagnostics.push(
          diagnostic({
            severity: 'warning',
            code: 'asm/unknown-directive',
            message: `Unknown directive "${statement.name}" (ignored).`,
            source: { line: statement.pos.line, column: statement.pos.column },
          }),
        );
      }
    } else {
      instructions.push({ stmt: statement, address });
      address += INSTRUCTION_BYTES;
    }
  }

  // Resolve the entry point from the first `.global` symbol, if any.
  let entryPoint = 0;
  const firstGlobal = [...globals][0];
  if (firstGlobal !== undefined) {
    const resolved = symbols.get(firstGlobal);
    if (resolved === undefined) {
      diagnostics.push(
        diagnostic({
          severity: 'error',
          code: 'asm/undefined-global',
          message: `Global symbol "${firstGlobal}" is not defined.`,
        }),
      );
    } else {
      entryPoint = resolved;
    }
  }

  // Pass 2: validate operands and encode.
  const encoded: EncodedInstruction[] = [];
  const sourceEntries: SourceMapEntry[] = [];

  for (const { stmt, address: addr } of instructions) {
    const spec = INSTRUCTION_SPECS[stmt.mnemonic];
    if (!spec) {
      const hint = suggestMnemonic(stmt.mnemonic);
      diagnostics.push(
        diagnostic({
          severity: 'error',
          code: 'asm/unknown-instruction',
          message: `Unknown instruction "${stmt.mnemonic}".`,
          source: { line: stmt.pos.line, column: stmt.pos.column },
          ...(hint ? { hint: `Did you mean \`${hint}\`?` } : {}),
        }),
      );
      continue;
    }
    if (stmt.operands.length !== spec.operands.length) {
      diagnostics.push(
        diagnostic({
          severity: 'error',
          code: 'asm/operand-count',
          message: `${stmt.mnemonic} expects ${spec.operands.length} operand(s) but got ${stmt.operands.length}.`,
          source: { line: stmt.pos.line, column: stmt.pos.column },
        }),
      );
      continue;
    }

    const fields = [0, 0, 0];
    let valid = true;
    spec.operands.forEach((kind, i) => {
      const operand = stmt.operands[i];
      if (!operand) {
        valid = false;
        return;
      }
      if (kind === 'register') {
        if (operand.kind !== 'register') {
          diagnostics.push(operandError(stmt, i, 'a register', operand.pos));
          valid = false;
          return;
        }
        fields[i] = operand.index;
      } else if (kind === 'immediate') {
        if (operand.kind !== 'immediate') {
          diagnostics.push(operandError(stmt, i, 'an immediate', operand.pos));
          valid = false;
          return;
        }
        if (operand.value < 0 || operand.value > 255) {
          diagnostics.push(
            diagnostic({
              severity: 'error',
              code: 'asm/immediate-range',
              message: `Immediate ${operand.value} is out of range (0-255).`,
              source: { line: operand.pos.line, column: operand.pos.column },
            }),
          );
          valid = false;
          return;
        }
        fields[i] = operand.value;
      } else {
        diagnostics.push(
          diagnostic({
            severity: 'error',
            code: 'asm/unsupported-operand',
            message: `${stmt.mnemonic} does not accept a ${kind} operand in this ISA.`,
            source: { line: operand.pos.line, column: operand.pos.column },
          }),
        );
        valid = false;
      }
    });
    if (!valid) continue;

    encoded.push({
      address: addr,
      opcode: spec.opcode,
      mnemonic: stmt.mnemonic,
      operandA: fields[0] as number,
      operandB: fields[1] as number,
      operandC: fields[2] as number,
      line: stmt.pos.line,
    });
    sourceEntries.push({ address: addr, line: stmt.pos.line, column: stmt.pos.column });
  }

  const success = diagnostics.every((d) => d.severity !== 'error');
  if (!success) {
    return { success: false, bytecode: null, diagnostics };
  }

  const symbolEntries: SymbolEntry[] = [...symbols.entries()]
    .map(([name, addr]) => ({ name, address: addr, global: globals.has(name) }))
    .sort((a, b) => a.address - b.address || (a.name < b.name ? -1 : 1));

  const sourceMap: SourceMap = options.fileName
    ? { version: 1, fileId: options.fileName, entries: sourceEntries }
    : { version: 1, entries: sourceEntries };

  const bytecode: BytecodeObject = {
    magic: 'NOVA',
    version: BYTECODE_VERSION,
    entryPoint,
    instructions: encoded,
    code: toCodeBytes(encoded),
    data: new Uint8Array(0),
    symbols: { symbols: symbolEntries },
    sourceMap,
    createdBy: 'novaos-assembler',
    sourceLanguage: 'assembly',
  };
  return { success: true, bytecode, diagnostics };
}

function operandError(
  stmt: InstructionStatement,
  index: number,
  expected: string,
  pos: { line: number; column: number },
): Diagnostic {
  return diagnostic({
    severity: 'error',
    code: 'asm/operand-kind',
    message: `${stmt.mnemonic} operand ${index + 1} must be ${expected}.`,
    source: { line: pos.line, column: pos.column },
  });
}
