import type { RegisterFileSnapshot } from '@novaos/cpu';

/**
 * The kernel saves and restores CPU registers across context switches without
 * holding the CPU directly. A kernel-backed runtime injects an implementation
 * wired to the live CPU (`capture = cpu.getRegisters`, `load = cpu.restore`).
 */
export interface RegisterPort {
  capture(): RegisterFileSnapshot;
  load(snapshot: RegisterFileSnapshot): void;
}
