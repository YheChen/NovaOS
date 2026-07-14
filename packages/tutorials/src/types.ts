/** Which lab surface a step exercises — the runner focuses that panel/view. */
export type TutorialFeature =
  'compiler' | 'debugger' | 'heap' | 'concurrency' | 'scheduler' | 'memory';

/**
 * A checkpoint the UI verifies before a step counts as done. It is a
 * discriminated union of plain data — NO stored functions, NO code strings —
 * so the dataset stays serializable and eval-free. Every kind here is verified
 * deterministically by running the step's program through the shared
 * `ProgramRunner` (see `verifyCheckpoint`).
 */
export type Checkpoint =
  /** Program output, trimmed, equals `value`. */
  | {
      readonly kind: 'expected-output';
      readonly id: string;
      readonly description: string;
      readonly value: string;
    }
  /** Program compiles with no error-severity diagnostics. */
  | {
      readonly kind: 'compiles-clean';
      readonly id: string;
      readonly description: string;
    }
  /** At least one diagnostic of `severity` is produced (a deliberate error lesson). */
  | {
      readonly kind: 'has-diagnostic';
      readonly id: string;
      readonly description: string;
      readonly severity: 'error' | 'warning' | 'info';
    }
  /**
   * A virtual-memory checkpoint: build an MMU from `config`, replay `accesses`,
   * and assert each translated physical address (or an expected fault). Fully
   * self-contained data — verified deterministically via `@novaos/mmu`.
   */
  | {
      readonly kind: 'mmu-translate';
      readonly id: string;
      readonly description: string;
      readonly config: MmuCheckpointConfig;
      readonly accesses: readonly MmuAccess[];
    };

export interface MmuCheckpointConfig {
  readonly pageSizeBytes: number;
  readonly virtualAddressBits: number;
  readonly physicalAddressBits: number;
  readonly replacementId: 'fifo' | 'clock';
  readonly seed: number;
}

export interface MmuAccess {
  readonly address: number;
  readonly kind: 'read' | 'write' | 'execute';
  /** Expected physical address after translation (when the access succeeds). */
  readonly expectPhysical?: number;
  /** When true, the translation is expected to fail (e.g. out of range). */
  readonly expectFault?: boolean;
}

export type CheckpointKind = Checkpoint['kind'];

export interface StarterProgram {
  readonly language: 'toy-c' | 'assembly';
  /** Extension drives runner language dispatch (`.c` / `.asm`). */
  readonly fileName: string;
  readonly source: string;
  /** Optional reference to the `@novaos/examples` id this source mirrors. */
  readonly exampleId?: string;
}

export interface TutorialStep {
  readonly id: string;
  readonly title: string;
  /** Plain-text explanation (rendered as text, never executed). */
  readonly explanation: string;
  /** Loaded into the editor when the step is opened; omitted for non-program steps. */
  readonly starterProgram?: StarterProgram;
  readonly feature: TutorialFeature;
  /** Checkpoints verified before the step is "done"; empty = informational. */
  readonly checkpoints: readonly Checkpoint[];
  readonly hints?: readonly string[];
}

export interface Tutorial {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly estimatedMinutes: number;
  /** Ordered — index is the canonical step order. */
  readonly steps: readonly TutorialStep[];
}
