import type { ProcessId, SimTime } from '@novaos/shared';
import type { RegisterFileSnapshot } from '@novaos/cpu';

export const Syscall = {
  PRINT: 0,
  MALLOC: 1,
  FREE: 2,
  EXIT: 4,
} as const;

export const SYSCALL_NAMES: Record<number, string> = {
  [Syscall.PRINT]: 'print',
  [Syscall.MALLOC]: 'malloc',
  [Syscall.FREE]: 'free',
  [Syscall.EXIT]: 'exit',
};

export function syscallName(id: number): string {
  return SYSCALL_NAMES[id] ?? `syscall-${id}`;
}

/** What a syscall handler returns to the kernel dispatcher. */
export type SyscallOutcome =
  | { readonly kind: 'return'; readonly value: number }
  | { readonly kind: 'exit'; readonly code: number };

export interface SyscallHandlerContext {
  readonly pid: ProcessId;
  readonly registers: RegisterFileSnapshot;
  readonly tick: SimTime;
  /** Write program output to the terminal device. */
  writeOutput(text: string): void;
  /** Emit a `kernel.process.output` event for the timeline. */
  emitOutput(value: number, text: string): void;
  /** Allocate `size` bytes on the process heap; returns the address (0 if full). */
  heapAlloc(size: number): number;
  /** Free a heap address; returns false if it was not allocated. */
  heapFree(address: number): boolean;
}

export type SyscallHandler = (context: SyscallHandlerContext) => SyscallOutcome;

// SYSCALL 0 — print the integer in R0 to stdout; returns 0 in R0.
const print: SyscallHandler = (context) => {
  const value = context.registers.r0;
  const text = `${value}\n`;
  context.writeOutput(text);
  context.emitOutput(value, text);
  return { kind: 'return', value: 0 };
};

// SYSCALL 1 — malloc(R0 = size); returns the address (0 if the heap is full) in R0.
const malloc: SyscallHandler = (context) => ({
  kind: 'return',
  value: context.heapAlloc(context.registers.r0),
});

// SYSCALL 2 — free(R0 = address); returns 1 on success, 0 if not allocated.
const free: SyscallHandler = (context) => ({
  kind: 'return',
  value: context.heapFree(context.registers.r0) ? 1 : 0,
});

// SYSCALL 4 — terminate the current process with the exit code in R0.
const exit: SyscallHandler = (context) => ({ kind: 'exit', code: context.registers.r0 });

export const SYSCALL_HANDLERS: Record<number, SyscallHandler> = {
  [Syscall.PRINT]: print,
  [Syscall.MALLOC]: malloc,
  [Syscall.FREE]: free,
  [Syscall.EXIT]: exit,
};
