import type { ProcessId, SimTime } from '@novaos/shared';
import type { RegisterFileSnapshot } from '@novaos/cpu';

export const Syscall = {
  PRINT: 0,
  MALLOC: 1,
  FREE: 2,
  EXIT: 4,
  SLEEP: 5,
  YIELD: 6,
  LOCK: 7,
  UNLOCK: 8,
  SHARED: 9,
  SEND: 10,
  RECEIVE: 11,
} as const;

export const SYSCALL_NAMES: Record<number, string> = {
  [Syscall.PRINT]: 'print',
  [Syscall.MALLOC]: 'malloc',
  [Syscall.FREE]: 'free',
  [Syscall.EXIT]: 'exit',
  [Syscall.SLEEP]: 'sleep',
  [Syscall.YIELD]: 'yield',
  [Syscall.LOCK]: 'lock',
  [Syscall.UNLOCK]: 'unlock',
  [Syscall.SHARED]: 'shared',
  [Syscall.SEND]: 'send',
  [Syscall.RECEIVE]: 'receive',
};

export function syscallName(id: number): string {
  return SYSCALL_NAMES[id] ?? `syscall-${id}`;
}

/** What a syscall handler returns to the kernel dispatcher. */
export type SyscallOutcome =
  | { readonly kind: 'return'; readonly value: number }
  | { readonly kind: 'exit'; readonly code: number }
  /** Block the caller until `wakeAtTick`; it resumes with `returnValue` in R0. */
  | { readonly kind: 'sleep'; readonly wakeAtTick: number; readonly returnValue: number }
  /** Voluntarily give up the CPU; the caller returns to the ready queue. */
  | { readonly kind: 'yield' }
  /** Block the caller on a wait channel (e.g. a contended lock) until woken. */
  | { readonly kind: 'block-on-channel'; readonly channel: number; readonly returnValue: number };

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
  /** Try to acquire mutex `id` for the caller; false means "must block". */
  acquireLock(id: number): boolean;
  /** Release mutex `id`, handing it to the next waiter (if any). */
  releaseLock(id: number): void;
  /** Absolute address of shared word `index` in the kernel's shared region. */
  sharedAddress(index: number): number;
  /** Send `value` on pipe `id` (delivered to a blocked receiver, else buffered). */
  pipeSend(id: number, value: number): void;
  /** Receive from pipe `id`: a buffered `value`, or a `channel` to block on. */
  pipeReceive(id: number): { readonly value: number } | { readonly channel: number };
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

// SYSCALL 5 — sleep(R0 = ticks); the process blocks until `tick + ticks`, then
// resumes with 0 in R0. Models a timed I/O wait.
const sleep: SyscallHandler = (context) => {
  const ticks = Math.max(0, context.registers.r0 | 0);
  return { kind: 'sleep', wakeAtTick: (context.tick as number) + ticks, returnValue: 0 };
};

// SYSCALL 6 — yield(); the process gives up the CPU and returns to the ready queue.
const yieldCpu: SyscallHandler = () => ({ kind: 'yield' });

// SYSCALL 7 — lock(R0 = mutex id). Acquires immediately if free, else blocks the
// caller on the mutex's wait channel; either way it resumes holding the lock.
const lock: SyscallHandler = (context) => {
  const id = context.registers.r0 | 0;
  if (context.acquireLock(id)) return { kind: 'return', value: 1 };
  return { kind: 'block-on-channel', channel: id, returnValue: 1 };
};

// SYSCALL 8 — unlock(R0 = mutex id). Releases the lock and wakes one waiter.
const unlock: SyscallHandler = (context) => {
  context.releaseLock(context.registers.r0 | 0);
  return { kind: 'return', value: 1 };
};

// SYSCALL 9 — shared(R0 = index). Returns the address of shared word `index`.
const shared: SyscallHandler = (context) => ({
  kind: 'return',
  value: context.sharedAddress(context.registers.r0 | 0),
});

// SYSCALL 10 — send(R0 = pipe, R1 = value). Never blocks (unbounded buffer).
const send: SyscallHandler = (context) => {
  context.pipeSend(context.registers.r0 | 0, context.registers.r1 | 0);
  return { kind: 'return', value: 1 };
};

// SYSCALL 11 — receive(R0 = pipe). Returns the next value, or blocks until one
// is sent (the sender writes the value straight into R0 on wake).
const receive: SyscallHandler = (context) => {
  const result = context.pipeReceive(context.registers.r0 | 0);
  if ('value' in result) return { kind: 'return', value: result.value };
  return { kind: 'block-on-channel', channel: result.channel, returnValue: 0 };
};

export const SYSCALL_HANDLERS: Record<number, SyscallHandler> = {
  [Syscall.PRINT]: print,
  [Syscall.MALLOC]: malloc,
  [Syscall.FREE]: free,
  [Syscall.EXIT]: exit,
  [Syscall.SLEEP]: sleep,
  [Syscall.YIELD]: yieldCpu,
  [Syscall.LOCK]: lock,
  [Syscall.UNLOCK]: unlock,
  [Syscall.SHARED]: shared,
  [Syscall.SEND]: send,
  [Syscall.RECEIVE]: receive,
};
