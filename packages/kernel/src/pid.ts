import { processId, type ProcessId } from '@novaos/shared';

/**
 * Deterministic PID allocation: PID 0 is reserved for the kernel, allocation
 * starts at 1 (`init`), and PIDs are not reused within a boot session.
 */
export const KERNEL_PID = processId(0);

export interface PidAllocator {
  next(): ProcessId;
  peek(): number;
  snapshot(): { nextPid: number };
  restore(snapshot: { nextPid: number }): void;
}

export function createPidAllocator(start = 1): PidAllocator {
  let nextPid = start;
  return {
    next() {
      const pid = processId(nextPid);
      nextPid += 1;
      return pid;
    },
    peek: () => nextPid,
    snapshot: () => ({ nextPid }),
    restore: (snapshot) => {
      nextPid = snapshot.nextPid;
    },
  };
}
