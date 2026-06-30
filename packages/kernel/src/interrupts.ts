import type { SimTime } from '@novaos/shared';

export type InterruptKind =
  'timer' | 'keyboard' | 'syscall' | 'breakpoint' | 'exception' | 'manual-pause';

export interface Interrupt {
  readonly kind: InterruptKind;
  readonly source: string;
  readonly tick: SimTime;
  readonly payload?: unknown;
}

export function timerInterrupt(tick: SimTime, source = 'timer'): Interrupt {
  return { kind: 'timer', source, tick };
}
