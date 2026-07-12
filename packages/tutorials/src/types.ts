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
    };

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
  /** Loaded into the editor when the step is opened. */
  readonly starterProgram: StarterProgram;
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
