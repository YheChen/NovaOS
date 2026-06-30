import type { Diagnostic } from '@novaos/shared';
import type { RegisterFileSnapshot } from '@novaos/cpu';
import type { BytecodeObject } from '@novaos/assembler';

export type DebuggerState = 'idle' | 'loaded' | 'running' | 'paused' | 'stepping' | 'terminated';

export type BreakpointId = number;

export interface LineBreakpoint {
  readonly id: BreakpointId;
  readonly kind: 'line';
  readonly line: number;
  enabled: boolean;
}
export interface InstructionBreakpoint {
  readonly id: BreakpointId;
  readonly kind: 'instruction';
  readonly address: number;
  enabled: boolean;
}
export interface ConditionalBreakpoint {
  readonly id: BreakpointId;
  readonly kind: 'conditional';
  readonly line: number;
  readonly expression: string;
  enabled: boolean;
}
export interface ExceptionBreakpoint {
  readonly id: BreakpointId;
  readonly kind: 'exception';
  enabled: boolean;
}
export interface MemoryBreakpoint {
  readonly id: BreakpointId;
  readonly kind: 'memory';
  readonly address: number;
  readonly access: 'write';
  enabled: boolean;
}

export type Breakpoint =
  | LineBreakpoint
  | InstructionBreakpoint
  | ConditionalBreakpoint
  | ExceptionBreakpoint
  | MemoryBreakpoint;

export interface WatchResult {
  readonly expression: string;
  readonly value: string;
  readonly type: 'int' | 'bool' | 'address' | 'unknown';
  readonly available: boolean;
  readonly diagnostic?: Diagnostic;
}

export interface CallStackFrame {
  readonly index: number;
  readonly functionName: string;
  readonly returnAddress: number | null;
  readonly basePointer: number;
  readonly stackPointer: number;
  readonly currentAddress: number;
  readonly sourceLine: number | null;
}

export interface DebugLocation {
  readonly address: number;
  readonly sourceLine: number | null;
}

export type PauseReason = 'entry' | 'step' | 'breakpoint' | 'exception' | 'paused' | 'terminated';

export interface TimelineSummary {
  /** Total executed instructions so far (the timeline cursor). */
  readonly cursor: number;
  /** Total recorded domain events up to the cursor. */
  readonly eventCount: number;
  readonly eventsByType: Record<string, number>;
}

export interface DebuggerSnapshot {
  readonly state: DebuggerState;
  readonly pauseReason: PauseReason;
  readonly currentLocation: DebugLocation | null;
  readonly registers: RegisterFileSnapshot;
  readonly callStack: CallStackFrame[];
  readonly watches: WatchResult[];
  readonly breakpoints: Breakpoint[];
  readonly timeline: TimelineSummary;
  readonly output: string;
  readonly exitCode: number | null;
}

/** A program to debug, plus the metadata needed for source-level features. */
export interface DebugProgram {
  readonly bytecode: BytecodeObject;
  /** address → source line (Toy C lines if compiled from `.c`, else asm lines). */
  readonly lineMap?: ReadonlyArray<{ readonly address: number; readonly line: number }>;
}

export interface ReplayConfig {
  readonly maxSteps?: number;
}
