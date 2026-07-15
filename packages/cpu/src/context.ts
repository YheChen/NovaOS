import type { Address, Result, SimTime, SimulationClock } from '@novaos/shared';
import type { EventBus } from '@novaos/events';
import type { RegisterFileSnapshot } from './register-file';

/**
 * The narrow view of memory the CPU needs. The real `@novaos/memory` `Memory`
 * structurally satisfies this port, so the CPU does not depend on the memory
 * package (dependency inversion keeps the CPU decoupled).
 */
export interface MemoryPort {
  readByte(address: Address): Result<number>;
  readWord(address: Address): Result<number>;
  /** Word write, used by the stack/memory instructions (PUSH/POP/CALL/STORE). */
  writeWord(address: Address, value: number): Result<void>;
}

/** A destination for program output (the M1 `PRINT` instruction writes here). */
export interface OutputSink {
  write(text: string): void;
}

/**
 * The syscall trap contract. When a `SYSCALL` instruction executes, the CPU
 * traps to this handler (implemented by the kernel) with the syscall id and a
 * register snapshot, and applies the returned outcome.
 */
export interface SyscallTrapRequest {
  readonly id: number;
  readonly registers: RegisterFileSnapshot;
  readonly tick: SimTime;
}

export type SyscallTrapResult =
  | { readonly kind: 'return'; readonly returnValue: number }
  | { readonly kind: 'exit'; readonly code: number }
  | { readonly kind: 'fault'; readonly code: string; readonly message: string }
  /** The process is descheduled (blocked/sleeping); write `returnValue` to R0 first. */
  | { readonly kind: 'block'; readonly returnValue: number }
  /** The process voluntarily yields the CPU; R0 is left unchanged. */
  | { readonly kind: 'yield' };

export interface SyscallTrap {
  invoke(request: SyscallTrapRequest): SyscallTrapResult;
}

/** Everything a single CPU step needs from the surrounding runtime. */
export interface VmExecutionContext {
  readonly memory: MemoryPort;
  readonly bus: EventBus;
  readonly clock: SimulationClock;
  readonly output: OutputSink;
  /** Installed by a kernel-backed runtime; absent on the bare M1 VM. */
  readonly syscallTrap?: SyscallTrap;
}
