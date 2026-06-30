/**
 * @novaos/debugger — run control, stepping, breakpoints, watch expressions,
 * call-stack reconstruction, timeline, and deterministic time-travel replay.
 *
 * The debugger drives the VM only through the simulator's public step/inspect
 * controls; it never mutates private CPU state. It imports no UI.
 */
export * from './types';
export * from './watch';
export * from './controller';

export const PACKAGE_NAME = '@novaos/debugger';
export const VERSION = '0.0.0';
