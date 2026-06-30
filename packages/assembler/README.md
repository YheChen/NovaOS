# @novaos/assembler

## Purpose

The NovaASM assembler: tokenizes and parses assembly source, resolves labels,
validates operands against the ISA, and emits a deterministic, versioned bytecode
object with a symbol table and a source map.

## Public API

- **`assemble(source, options?)` → `AssembleResult`** (`{ success, bytecode, diagnostics }`).
- **Lexer/parser:** `tokenize`, `parse`, `AssemblyStatement` AST, `AssemblyOperand`.
- **ISA:** `INSTRUCTION_SPECS`, `KNOWN_MNEMONICS`, `parseRegister`, `parseImmediate`.
- **Bytecode:** `BytecodeObject`, `EncodedInstruction`, `SymbolTableSnapshot`, `toCodeBytes`.
- **Source map:** `SourceMap`, `SourceMapEntry`, `lineForAddress`, `addressForLine`.

## Bytecode object

`{ magic: 'NOVA', version, entryPoint, instructions: EncodedInstruction[],
code: Uint8Array (little-endian), data, symbols, sourceMap, createdBy,
sourceLanguage: 'assembly' }`. `entryPoint` is the byte offset of the first
`.global` symbol. Encoding is byte-for-byte deterministic for identical source.

## Source map

A skeleton mapping each instruction's byte `address` ↔ source `line`/`column`,
with `lineForAddress` / `addressForLine` helpers (consumed by the debugger in M6).

## Diagnostics

Line-specific diagnostics for unknown instructions (with edit-distance
suggestions), invalid registers, out-of-range immediates, wrong operand counts,
unsupported operand kinds, undefined `.global` symbols, and duplicate labels.

## Testing

Golden tests pin the encoded bytes, symbol table, and source map for the acceptance
file; determinism is verified across two assemblies; invalid-assembly tests cover each
error class.

## Dependency Rules

Depends on `@novaos/cpu` (opcode table + encoding) and `@novaos/shared` (diagnostics).
UI-free and deterministic. Memory/label operands are parsed but rejected until the ISA
gains `LOAD`/`STORE`/`JMP`.
