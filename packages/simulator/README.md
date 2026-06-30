# @novaos/simulator

## Purpose

The runtime that drives execution. In Milestone 1 it wires together the CPU,
memory, event bus, deterministic clock, and an output sink into a `VirtualMachine`
that loads a program, steps it, runs it to `HALT`, and exposes the resulting
state, output, and event trace. Boot orchestration, snapshots/restore for time
travel, and kernel coordination layer on in later milestones.

## Public API

- **`createVirtualMachine(options)` → `VirtualMachine`** — `step`, `run`, `getStatus`,
  `getOutput`, `getOutputLines`, `getRegisters`, `getEvents`, `getSnapshot`.
- **`buildProgram(instructions, entryPoint?)`** — hand-assemble bytecode (M1 stand-in
  for the assembler), `ProgramImage`, `InstructionWord`.
- **`createBufferedOutput()`** → `BufferedOutput`.
- Runtime event builders + `RuntimeEventType`.

## Events

`runtime.program.loaded`, `runtime.halted`, `runtime.faulted`, `runtime.step-limit`
(plus all CPU events surfaced via the shared bus / recorder).

## Snapshots

`VmSnapshot` (`status`, `clock`, `cpu`, `memory`) — composed from the CPU and memory
snapshots.

## Testing

Integration test runs the flagship demo (`MOV/ADD/PRINT/HALT → 15`) and asserts the
exact event sequence; a determinism test proves two runs produce identical events and
final state; a fault test covers invalid-opcode handling; output helpers are unit-tested.

## Dependency Rules

Depends on `@novaos/cpu`, `@novaos/memory`, `@novaos/events`, and `@novaos/shared`.
No UI, deterministic. Passes the real `Memory` to the CPU via its `MemoryPort`.
