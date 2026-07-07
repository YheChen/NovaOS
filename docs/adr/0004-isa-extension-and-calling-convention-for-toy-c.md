# ADR-0004: ISA Extension and Calling Convention for Toy C

## Status

Accepted

## Context

Milestone 1 shipped a minimal ISA (`NOP`, `MOV`, `ADD`, `PRINT`, `SYSCALL`,
`HALT`) sufficient to run a straight-line "add two numbers" program. Milestone 5
adds a Toy C compiler whose Version 1 language includes arithmetic, comparison,
boolean logic, `if`/`else`, `while`, functions, parameters, and `return`. None of
those can be lowered without register-register data movement, comparison/branch
instructions, and a call stack.

Constraints:

- Instructions are fixed-width 32-bit words `[OPCODE(8) | A(8) | B(8) | C(8)]`.
  Each operand field is only 8 bits.
- The kernel loads each process's code segment at a base address chosen by the
  first-fit allocator, so absolute jump targets are not known at assemble time.
- The M1 handler model is pure: `(instruction, registers) -> effect`, with the
  CPU step unconditionally advancing `PC` by one instruction. It has no memory
  access and no way to redirect control flow.
- The existing M4 golden test pins the encodings of `MOV`/`ADD`/`SYSCALL`/`HALT`.

## Decision

**1. Extend the ISA** with the following instructions (opcodes 5-29):
`MOVR`, `LDI`, `SUB`, `MUL`, `DIV`, `MOD`, `NEG`, `NOT`, `CEQ`/`CNE`/`CLT`/`CLE`/
`CGT`/`CGE` (comparisons that write 0/1), `AND`/`OR` (logical), `JMP`/`JZ`/`JNZ`,
`PUSH`/`POP`/`CALL`/`RET`, and `LOAD`/`STORE`. Existing opcodes and their
encodings are unchanged, so the M4 golden test still passes.

**2. Encoding conventions** within the 8-bit fields:

- Register operands are register _indices_: 0-7 = R0-R7, **8 = SP, 9 = BP**.
- Control-flow targets (`JMP`/`JZ`/`JNZ`/`CALL`) encode a **PC-relative signed
  16-bit byte offset** packed into fields B (high) and C (low); the CPU computes
  `nextPc = pc + offset`. This keeps programs position-independent regardless of
  the load base - no relocation step is needed.
- `LDI` packs an unsigned 16-bit immediate into B/C (so integer constants up to
  65535 load in one instruction; `MOV` still loads 0-255).
- `LOAD`/`STORE` use a signed 8-bit displacement in field C: `mem[base + disp]`.

**3. Extend the CPU execution model.** The instruction effect gains optional
`memoryWrites` and `nextPc`. Handlers receive a read-only memory port (for
`LOAD`/`POP`/`RET`). The CPU step applies memory writes (faulting on
out-of-bounds, e.g. stack overflow) and sets `PC` to `nextPc` when present,
otherwise advances by one instruction. Arithmetic/comparison/logical ops accept
SP/BP as operands so the compiler can do stack-pointer arithmetic.

**4. Calling convention** (matches spec §15 with explicit slot offsets):

- Stack grows **down**; `PUSH` does `SP -= 4; mem[SP] = reg`; `POP` reverses it.
- `R0` holds the return value. Scratch: `R0`/`R1` (caller-saved).
- **Arguments** are pushed right-to-left by the caller; argument `i` is read by
  the callee at `[BP + 8 + 4*i]` (`[BP]` = saved BP, `[BP+4]` = return address).
  The **caller** pops arguments after the call (cdecl-style cleanup).
- **Prologue:** `PUSH BP; MOVR BP, SP; SUB SP, SP, <frameSize>`.
- **Locals** (and IR temporaries) live at `[BP - 4*(slot+1)]`.
- **Epilogue:** `MOVR SP, BP; POP BP; RET`.
- `main` is reached from a generated `_start` bootstrap (`CALL main; HALT`), so
  `main` is an ordinary function and its `return` lowers like any other.

## Consequences

- The Toy C compiler can lower the full Version 1 language with a simple,
  register-allocator-free, stack-based code generator (every value gets a frame
  slot; `R0`/`R1` are pure scratch). Recursion works for free.
- The call-frame layout is fixed and documented, so the Milestone 6 debugger can
  reconstruct the call stack by walking saved BPs.
- Integer constants are limited to **0-65535** via `LDI` in V1, and arithmetic is
  unsigned 32-bit at the print boundary (negative results display as their
  unsigned wrap). Both are documented limitations, acceptable for the
  educational scope and revisited if a future milestone needs wider literals or
  signed display.
- Operand fields remain 8-bit, so jump range is ±32 KB and displacement range is
  ±128 bytes - far beyond demo programs; the assembler reports an error if a
  program exceeds them.

## Alternatives Considered

- **Absolute jump targets + a loader relocation pass.** Rejected: more moving
  parts and a load-time rewrite for no educational benefit over PC-relative.
- **A register allocator** instead of spilling every value to a frame slot.
  Rejected for V1: correctness and inspectability matter more than register
  pressure; the slot model is trivial to verify and to show in the UI.
- **Variable-length instructions** (e.g. a 32-bit immediate following `LDI`).
  Rejected: it complicates fetch/decode and the timeline for marginal gain;
  16-bit immediates cover the demos.
- **Special-casing control flow in the CPU step** (like `SYSCALL`/`HALT`).
  Rejected in favor of the uniform `nextPc`/`memoryWrites` effect, which keeps
  handlers pure and testable.
