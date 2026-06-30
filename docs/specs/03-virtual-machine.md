# NovaOS — Virtual Machine & CPU Specification

**Document:** 03-virtual-machine.md  
**Version:** 2.0  
**Status:** Execution-ready technical specification  
**Primary consumer:** Claude Code / UltraCode VM, CPU, assembler, debugger, and testing agents  

---

## 1. Purpose

This document defines the NovaOS Virtual Machine, abbreviated NVM. It specifies the CPU model, register file, memory interaction rules, instruction set architecture, bytecode encoding, execution pipeline, traps, exceptions, interrupt hooks, source map integration, debugger events, determinism requirements, and test strategy.

The NVM is the technical heart of NovaOS. It should be simple enough for students to understand and rigorous enough to support a serious debugger, scheduler, assembler, compiler, and replay system.

NovaOS does not emulate x86, ARM, or RISC-V directly. It defines a custom educational ISA inspired by real machines.

---

## 2. Design Goals

The VM must be:

1. Deterministic.
2. Easy to visualize.
3. Easy to test.
4. Simple to compile to.
5. Capable of controlled faults.
6. Compatible with source maps.
7. Extensible without breaking old programs.
8. Fast enough for interactive execution.
9. Clear enough for educational explanation.

The VM is not designed for maximum performance or binary compatibility. It is designed for inspectability.

---

## 3. Machine Overview

The NovaOS VM consists of:

- One CPU core in MVP
- A register file
- Byte-addressable RAM
- A program counter
- A stack pointer
- A base pointer
- A flags register
- A fixed-width instruction format
- A trap mechanism for syscalls and exceptions
- A debugger pause mechanism

MVP machine parameters:

| Parameter | Value |
|---|---:|
| Word size | 32 bits |
| Address size | 32 bits, constrained by configured RAM |
| Default RAM | 64 KiB |
| Byte order | Little-endian |
| Instruction width | 32 bits / 4 bytes |
| General registers | 8 |
| Special registers | PC, SP, BP, FLAGS, IR |
| Stack direction | Downward |
| Heap direction | Upward |

---

## 4. Execution Philosophy

Every instruction should be explainable as a sequence of visible stages:

```text
Fetch → Decode → Validate → Execute → Write Back → Emit Events → Advance/Persist PC
```

Each stage may be exposed to the debugger and timeline.

The VM must support two modes:

1. Instruction-step mode: execute exactly one instruction and pause.
2. Continuous mode: execute until pause, breakpoint, trap, halt, quantum expiration, or configured limit.

---

## 5. Register File

### 5.1 General-purpose registers

NovaOS has eight 32-bit general-purpose registers:

```text
R0 R1 R2 R3 R4 R5 R6 R7
```

Conventions:

- `R0` may be used as general-purpose. It is not hardwired to zero.
- `R0` and `R1` are commonly used for syscall arguments and return values by convention.
- `R6` and `R7` may be used by compiler backends as scratch registers.

### 5.2 Special registers

| Register | Meaning |
|---|---|
| `PC` | Program Counter, address of next instruction |
| `SP` | Stack Pointer, address of top of stack |
| `BP` | Base Pointer, stable reference for stack frames |
| `FLAGS` | Packed condition and mode flags |
| `IR` | Instruction Register, last fetched raw instruction |

### 5.3 Register snapshot

```ts
export interface RegisterFileSnapshot {
  r0: number;
  r1: number;
  r2: number;
  r3: number;
  r4: number;
  r5: number;
  r6: number;
  r7: number;
  pc: Address;
  sp: Address;
  bp: Address;
  flags: FlagsRegister;
  ir: Word;
}
```

---

## 6. Flags Register

The `FLAGS` register stores CPU condition flags.

| Flag | Name | Meaning |
|---|---|---|
| `Z` | Zero | Last result was zero |
| `N` | Negative | Last result was negative when interpreted as signed |
| `C` | Carry | Unsigned carry/borrow occurred |
| `O` | Overflow | Signed overflow occurred |
| `I` | Interrupt Enabled | Maskable interrupts enabled |
| `E` | Exception | CPU is in exception state |

Flags should update after arithmetic and comparison instructions.

Comparison instructions update flags but do not store a result.

---

## 7. Memory Model

The VM reads and writes through the memory package. The CPU must not own raw RAM arrays directly.

Default layout for a process:

```text
0x0000 ┌──────────────────────────┐
       │ Kernel Reserved          │
       ├──────────────────────────┤
       │ Program Code             │
       ├──────────────────────────┤
       │ Static Data              │
       ├──────────────────────────┤
       │ Heap grows upward        │
       │                          │
       │ Free Space               │
       │                          │
       │ Stack grows downward     │
0xFFFF └──────────────────────────┘
```

All memory access must be validated by the memory subsystem. Invalid accesses produce CPU faults or kernel traps depending on context.

---

## 8. Instruction Encoding

MVP uses fixed-width 32-bit instructions:

```text
31        24 23        16 15         8 7          0
+------------+------------+------------+------------+
|  OPCODE    |    A       |    B       |    C       |
+------------+------------+------------+------------+
```

- `OPCODE`: 8-bit opcode
- `A`, `B`, `C`: 8-bit operands or operand descriptors

This encoding is intentionally simple for visualization. Future versions may introduce extended instructions.

---

## 9. Operand Model

MVP supports a limited operand model for ease of implementation.

Operand categories:

- Register
- Immediate small integer
- Memory address
- Label resolved to address by assembler

Because fixed-width operands are small, the assembler may emit pseudo-instructions for large immediates in future versions. MVP can constrain immediate values to a safe educational range or use a constant table.

Recommended MVP simplification:

- Most arithmetic uses registers.
- `MOV` supports small immediates.
- Larger constants are loaded from static data or encoded through assembler expansion.

---

## 10. Addressing Modes

MVP addressing modes:

| Mode | Example | Meaning |
|---|---|---|
| Register | `R1` | Value in register |
| Immediate | `#42` or `42` | Literal value |
| Absolute | `[0x1200]` | Memory at address |
| Register indirect | `[R2]` | Memory at address in register |
| Base offset | `[BP-4]` | Stack frame access |

The assembler should normalize syntax into bytecode operands and metadata.

---

## 11. Instruction Set Summary

### 11.1 Data movement

| Instruction | Example | Description |
|---|---|---|
| `MOV` | `MOV R0, 5` | Copy immediate/register to register |
| `LOAD` | `LOAD R0, [R1]` | Load memory into register |
| `STORE` | `STORE [R1], R0` | Store register into memory |
| `PUSH` | `PUSH R0` | Push register value onto stack |
| `POP` | `POP R0` | Pop stack value into register |

### 11.2 Arithmetic

| Instruction | Example | Description |
|---|---|---|
| `ADD` | `ADD R2, R0, R1` | Add |
| `SUB` | `SUB R2, R0, R1` | Subtract |
| `MUL` | `MUL R2, R0, R1` | Multiply |
| `DIV` | `DIV R2, R0, R1` | Divide, traps on zero |
| `MOD` | `MOD R2, R0, R1` | Remainder |
| `INC` | `INC R0` | Increment |
| `DEC` | `DEC R0` | Decrement |

### 11.3 Bitwise

| Instruction | Example | Description |
|---|---|---|
| `AND` | `AND R2, R0, R1` | Bitwise and |
| `OR` | `OR R2, R0, R1` | Bitwise or |
| `XOR` | `XOR R2, R0, R1` | Bitwise xor |
| `NOT` | `NOT R0` | Bitwise not |
| `SHL` | `SHL R0, 1` | Shift left |
| `SHR` | `SHR R0, 1` | Shift right |

### 11.4 Comparison and branching

| Instruction | Example | Description |
|---|---|---|
| `CMP` | `CMP R0, R1` | Set flags based on comparison |
| `JMP` | `JMP loop` | Unconditional jump |
| `JE` | `JE done` | Jump if equal / zero |
| `JNE` | `JNE loop` | Jump if not equal |
| `JLT` | `JLT small` | Jump if less than |
| `JGT` | `JGT large` | Jump if greater than |

### 11.5 Calls and stack

| Instruction | Example | Description |
|---|---|---|
| `CALL` | `CALL fn` | Push return address and jump |
| `RET` | `RET` | Pop return address and jump back |
| `ENTER` | `ENTER 8` | Set up stack frame, optional future instruction |
| `LEAVE` | `LEAVE` | Tear down stack frame, optional future instruction |

### 11.6 System and control

| Instruction | Example | Description |
|---|---|---|
| `SYSCALL` | `SYSCALL 0` | Trap into kernel syscall dispatcher |
| `BREAK` | `BREAK` | Debugger breakpoint trap |
| `NOP` | `NOP` | No operation |
| `HALT` | `HALT` | Stop current process |

---

## 12. Instruction Semantics

### 12.1 MOV

`MOV dst, src`

- `dst` must be register.
- `src` may be register or immediate.
- Copies value into `dst`.
- Updates `Z` and `N` flags.
- Advances PC by instruction width.

### 12.2 ADD

`ADD dst, lhs, rhs`

- Computes `lhs + rhs` as 32-bit integer.
- Stores result in `dst`.
- Updates `Z`, `N`, `C`, and `O`.
- Advances PC.

### 12.3 DIV

`DIV dst, lhs, rhs`

- If `rhs` is zero, raise `DivideByZero` fault.
- Otherwise stores integer quotient in `dst`.
- Updates flags.

### 12.4 CMP

`CMP lhs, rhs`

- Computes conceptual `lhs - rhs`.
- Does not store result.
- Updates flags.

### 12.5 JMP

`JMP target`

- Sets PC to target address.
- Does not auto-advance PC after execution.

### 12.6 CALL

`CALL target`

1. Push return address (`PC + 4`) onto stack.
2. Set `PC` to target.
3. Emit stack write and control-flow events.

### 12.7 RET

`RET`

1. Pop return address from stack.
2. Set `PC` to popped address.
3. Trap on stack underflow.

### 12.8 SYSCALL

`SYSCALL id`

1. Save CPU context.
2. Emit syscall trap event.
3. Transfer control to kernel syscall dispatcher.
4. Kernel returns result through register convention.
5. Resume process or change process state.

---

## 13. Execution Pipeline

```mermaid
flowchart LR
    Fetch --> Decode
    Decode --> Validate
    Validate --> Execute
    Execute --> WriteBack
    WriteBack --> Events
    Events --> AdvancePC
    AdvancePC --> DebugCheck
    DebugCheck --> SchedulerCheck
```

### 13.1 Fetch

Fetch reads four bytes from memory at `PC` and stores the raw word in `IR`.

Faults:

- PC outside executable memory
- memory read violation
- incomplete instruction

Events:

- `cpu.instruction.fetched`

### 13.2 Decode

Decode converts raw bytes into an instruction object.

Faults:

- invalid opcode
- unsupported encoding

Events:

- optional `cpu.instruction.decoded` in debug mode

### 13.3 Validate

Validate checks operand legality.

Faults:

- invalid register
- invalid addressing mode
- write to non-writable location

### 13.4 Execute

Execute performs instruction behavior using CPU and memory services.

### 13.5 Write back

Write back persists register changes and memory changes.

### 13.6 Emit events

Events must describe changes after execution.

### 13.7 PC handling

Most instructions advance `PC` by 4. Control-flow instructions set `PC` explicitly.

Instruction handlers must indicate whether PC should auto-advance.

```ts
export interface InstructionExecutionResult {
  pcBehavior: 'advance' | 'set' | 'halt' | 'trap';
  nextPc?: Address;
  cycles: number;
  events: DomainEvent[];
}
```

---

## 14. CPU API

```ts
export interface Cpu {
  reset(initial?: Partial<RegisterFileSnapshot>): void;
  getRegisters(): RegisterFileSnapshot;
  setRegister(register: RegisterName, value: Word): void;
  step(context: CpuExecutionContext): CpuStepResult;
  getSnapshot(): CpuSnapshot;
  restoreSnapshot(snapshot: CpuSnapshot): void;
}
```

```ts
export interface CpuExecutionContext {
  processId: ProcessId;
  memory: Memory;
  eventBus: EventBus;
  syscallTrap: SyscallTrapHandler;
  interruptController: InterruptController;
  debugHooks: CpuDebugHooks;
}
```

---

## 15. Instruction Handler API

```ts
export interface InstructionHandler {
  readonly opcode: Opcode;
  readonly mnemonic: string;
  validate(instruction: DecodedInstruction, context: ValidationContext): ValidationResult;
  execute(instruction: DecodedInstruction, context: ExecutionContext): InstructionExecutionResult;
}
```

Instruction handlers must be pure where practical. They should not access global state.

---

## 16. Program Image

A loaded program is represented as a program image.

```ts
export interface ProgramImage {
  id: ProgramImageId;
  name: string;
  entryPoint: Address;
  code: Uint8Array;
  staticData?: Uint8Array;
  symbols: SymbolTable;
  sourceMap: SourceMap;
  metadata: ProgramMetadata;
}
```

The kernel loads program images into process memory.

---

## 17. Bytecode File Format

NovaOS bytecode files should be versioned.

```ts
export interface BytecodeModule {
  magic: 'NOVA';
  version: string;
  entryPoint: number;
  instructions: EncodedInstruction[];
  symbols: SymbolTable;
  sourceMap: SourceMap;
  metadata: {
    createdBy: string;
    sourceLanguage: 'assembly' | 'toy-c';
  };
}
```

---

## 18. Assembly Syntax

Example:

```asm
; Sum numbers from 1 to 5
MOV R0, 1      ; counter
MOV R1, 0      ; sum
MOV R2, 5      ; limit

loop:
ADD R1, R1, R0
INC R0
CMP R0, R2
JLT loop

SYSCALL 0      ; print R1 by convention
HALT
```

Syntax requirements:

- Comments start with `;`.
- Labels end with `:`.
- Instructions are case-insensitive but normalized uppercase.
- Registers are written as `R0` through `R7`.
- Hex literals use `0x` prefix.
- Decimal literals are default.

---

## 19. Source Maps

Every emitted instruction must map to source.

```ts
export interface SourceMapEntry {
  instructionAddress: Address;
  fileId: FileId;
  line: number;
  columnStart: number;
  columnEnd: number;
  symbol?: string;
}
```

Source maps enable:

- current line highlight
- breakpoints by line
- compiler diagnostics
- stack traces
- timeline source navigation

---

## 20. Exceptions and Faults

VM faults:

| Fault | Cause |
|---|---|
| `InvalidOpcode` | Unknown opcode |
| `InvalidOperand` | Operand not legal for instruction |
| `DivideByZero` | Division by zero |
| `SegmentationFault` | Invalid memory access |
| `StackOverflow` | Stack collides or exceeds bounds |
| `StackUnderflow` | Pop/return without stack data |
| `IllegalInstruction` | Instruction disallowed in current mode |
| `BreakpointTrap` | BREAK instruction or debugger breakpoint |

Fault structure:

```ts
export interface VmFault {
  code: VmFaultCode;
  processId: ProcessId;
  pc: Address;
  instruction?: DecodedInstruction;
  message: string;
  severity: 'recoverable' | 'fatal';
  sourceLocation?: SourceLocation;
}
```

Faults pause execution and emit events.

---

## 21. Interrupt Hooks

MVP interrupt support is simple but architecturally explicit.

Interrupt types:

- Timer
- Keyboard, future
- Syscall
- Breakpoint
- Exception

The CPU does not decide scheduling. It exposes trap points. The kernel and runtime coordinate interrupts.

```ts
export interface InterruptController {
  raise(interrupt: Interrupt): void;
  poll(): Interrupt | null;
}
```

---

## 22. Syscall Convention

MVP convention:

- `SYSCALL id` identifies syscall.
- `R0`, `R1`, `R2` contain arguments.
- Return value is placed in `R0`.
- Error code may be placed in `R1`.

Example print syscall:

```asm
MOV R0, 42
SYSCALL 0
```

The kernel interprets syscall `0` as print integer/string depending on metadata or argument mode.

---

## 23. Debugger Integration

The VM must support debugger hooks before and after instruction execution.

```ts
export interface CpuDebugHooks {
  beforeInstruction?(context: DebugInstructionContext): PauseDecision;
  afterInstruction?(context: DebugInstructionContext): PauseDecision;
  onFault?(fault: VmFault): PauseDecision;
}
```

Pause reasons:

- breakpoint
- step complete
- fault
- manual pause
- process halt
- scheduler quantum expired

---

## 24. Breakpoint Semantics

Line breakpoints map to instruction addresses using source maps.

Instruction breakpoint behavior:

1. Runtime checks breakpoint before executing instruction at PC.
2. If matched, execution pauses.
3. Instruction has not yet mutated state.
4. UI highlights source line and instruction.

Conditional breakpoints evaluate in debugger context. They must not mutate VM state.

---

## 25. Event Requirements

The VM emits structured events.

Required events:

- `cpu.reset`
- `cpu.instruction.fetched`
- `cpu.instruction.executed`
- `cpu.register.changed`
- `cpu.flags.changed`
- `cpu.fault.raised`
- `cpu.halted`
- `cpu.breakpoint.hit`

High-frequency events may be batched for UI, but the trace must preserve ordering.

---

## 26. Determinism Requirements

The VM must not depend on:

- wall-clock time
- host CPU speed
- unseeded randomness
- object key iteration where order is ambiguous
- async race conditions

Given the same:

- bytecode
- initial memory
- initial registers
- scheduler configuration
- input events
- seed

The VM must produce the same:

- final state
- event sequence
- faults
- output

---

## 27. Performance Requirements

Targets:

| Operation | Target |
|---|---:|
| Single instruction step | < 1 ms domain time for simple instruction |
| UI-visible step | < 16 ms render target |
| Continuous simple loop | 100,000+ instr/sec target in domain core |
| Breakpoint lookup | O(1) |
| Register snapshot | O(number of registers) |
| Memory read/write | O(1), excluding validation metadata |

Performance must not compromise correctness or determinism.

---

## 28. Testing Strategy

### 28.1 Instruction tests

Every instruction requires tests for:

- normal behavior
- flag behavior
- PC behavior
- invalid operands
- event emission
- edge cases

### 28.2 Golden program tests

Golden programs:

- arithmetic
- loop
- function call
- stack push/pop
- divide by zero
- invalid memory access
- syscall print
- branch behavior

Each golden test should assert final registers, memory, output, and event sequence.

### 28.3 Determinism tests

Run the same program twice from identical snapshots and compare complete results.

### 28.4 Source map tests

Ensure breakpoints by source line map to correct instruction addresses.

---

## 29. Example Execution Trace

For program:

```asm
MOV R0, 5
MOV R1, 10
ADD R2, R0, R1
HALT
```

Expected high-level trace:

```text
cpu.instruction.fetched PC=0x0000 opcode=MOV
cpu.register.changed R0: 0 -> 5
cpu.instruction.executed MOV
cpu.instruction.fetched PC=0x0004 opcode=MOV
cpu.register.changed R1: 0 -> 10
cpu.instruction.executed MOV
cpu.instruction.fetched PC=0x0008 opcode=ADD
cpu.register.changed R2: 0 -> 15
cpu.flags.changed Z=false N=false
cpu.instruction.executed ADD
cpu.instruction.fetched PC=0x000C opcode=HALT
cpu.halted
```

---

## 30. Future Extensions

The VM should allow future additions:

- 16 general registers
- floating-point registers
- vector instructions
- memory-mapped I/O
- virtual memory
- page faults
- privilege modes
- multicore execution
- cache simulation
- DMA simulation
- linker and object files
- richer debug symbols

All extensions must preserve compatibility with versioned bytecode modules.

---

## 31. Implementation Order

Recommended implementation order:

1. Define shared numeric branded types.
2. Implement register file.
3. Implement memory read/write interface.
4. Implement instruction encoding/decoding.
5. Implement `MOV`, `ADD`, `SUB`, `HALT`.
6. Implement runtime step loop.
7. Implement events.
8. Add branching.
9. Add stack instructions.
10. Add syscall trap.
11. Add faults.
12. Add debugger hooks.
13. Add assembler source maps.
14. Add full instruction test suite.

---

## 32. Definition of Done

The VM is complete for MVP when:

- Register file works and is serializable.
- Memory read/write is validated.
- MVP instruction set executes correctly.
- Every instruction has tests.
- Faults pause execution with diagnostics.
- Breakpoints work through source maps.
- Events are emitted in deterministic order.
- Snapshot and restore work.
- Golden programs pass.
- VM can run independently of React.
- UI can visualize execution entirely from events and snapshots.

---

## 33. Final VM Directive

The NovaOS VM should be designed like a teaching instrument.

Every instruction should be inspectable. Every state mutation should be explainable. Every crash should become a lesson. The VM should be small enough to understand, disciplined enough to test, and extensible enough to become the foundation for the rest of NovaOS.
