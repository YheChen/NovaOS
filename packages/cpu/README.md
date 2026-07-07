# @novaos/cpu

## Purpose

The NovaOS CPU and instruction-set core. Owns the register file, FLAGS, the
fixed-width instruction encoding/decoder, the per-opcode execution handlers, and
the single-instruction fetch → decode → execute → write-back pipeline (`Cpu.step`).

## Public API

- **`createCpu()` → `Cpu`** - `reset`, `getRegisters`, `setRegister`, `getSnapshot`,
  `restoreSnapshot`, and `step(ctx)`.
- **`createRegisterFile()`**, `RegisterFileSnapshot`, `FlagsRegister`, `RegisterName`,
  `GPR_NAMES`, `gprNameFromIndex`.
- **`Opcode`**, `MNEMONICS`, `INSTRUCTION_SIZE`, `encodeInstruction`, `isOpcode`.
- **`decode(word)`**, `DecodedInstruction`.
- **`HANDLERS`**, `InstructionHandler`, `InstructionEffect`.
- **`VmExecutionContext`**, `MemoryPort`, `OutputSink`.
- **`VmFault`**, `VmFaultCode`, `vmFault`.
- CPU event builders + `CpuEventType`.

## Events

`cpu.instruction.fetched`, `cpu.instruction.executed`, `cpu.register.changed`,
`cpu.flags.changed`, `cpu.output`, `cpu.halted`, `cpu.fault.raised`. Register and
flag events fire only on an actual change.

## Snapshots

`CpuSnapshot` (the register-file snapshot) - plain, serializable, restorable.

## Testing

Unit tests cover the register file (masking, reset overrides, snapshot
independence), the decoder (round-trip + invalid opcode), and every handler
(MOV/ADD flag behavior incl. carry/overflow, PRINT output, HALT, invalid register).

## Dependency Rules

Depends on `@novaos/shared` and `@novaos/events` only. Reads memory through the
local `MemoryPort` interface, so it does **not** depend on `@novaos/memory`. No UI,
no `Date.now()` / `Math.random()`.
