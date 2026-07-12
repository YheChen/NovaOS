import type { PageTableSnapshot } from './page-table';
import type { FrameTableSnapshot } from './frames';
import type { ReplacementSnapshot, ReplacementPolicyId } from './replacement';
import type { TlbSnapshot } from './tlb';
import type { AddressConfig } from './address';

export type TranslationStage =
  | 'decode'
  | 'tlb-hit'
  | 'tlb-miss'
  | 'pte-hit'
  | 'protection-fault'
  | 'page-fault-serviced'
  | 'compose';

/** One row in the step-by-step translation walkthrough. */
export interface TranslationStep {
  readonly stage: TranslationStage;
  readonly label: string;
  readonly detail: Record<string, number | string | boolean | null>;
}

export interface TranslationTrace {
  readonly pid: number;
  readonly virtualAddress: number;
  readonly vpn: number;
  readonly offset: number;
  readonly frame: number | null;
  readonly physicalAddress: number | null;
  readonly steps: readonly TranslationStep[];
}

/** Full deterministic snapshot for restore + the web view. */
export interface MmuSnapshot {
  readonly version: number;
  readonly config: AddressConfig;
  readonly replacementId: ReplacementPolicyId;
  readonly randomState: number;
  readonly tick: number;
  readonly frames: FrameTableSnapshot;
  readonly replacement: ReplacementSnapshot;
  readonly tlb: TlbSnapshot;
  readonly pageTables: readonly PageTableSnapshot[];
  readonly lastTranslation: TranslationTrace | null;
}
