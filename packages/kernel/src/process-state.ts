/**
 * Process lifecycle states and the legal transitions between them (spec §8).
 * The kernel is the sole authority that applies transitions.
 */
export type ProcessState =
  'new' | 'ready' | 'running' | 'waiting' | 'blocked' | 'sleeping' | 'terminated' | 'faulted';

const TRANSITIONS: Record<ProcessState, readonly ProcessState[]> = {
  new: ['ready'],
  ready: ['running'],
  running: ['ready', 'waiting', 'blocked', 'sleeping', 'terminated', 'faulted'],
  waiting: ['ready'],
  blocked: ['ready'],
  sleeping: ['ready'],
  faulted: ['terminated'],
  terminated: [],
};

export function canTransition(from: ProcessState, to: ProcessState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isTerminal(state: ProcessState): boolean {
  return state === 'terminated';
}
