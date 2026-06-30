import type { SimulationClock } from '@novaos/shared';
import type { EventBus } from '@novaos/events';
import type { FileSystem, AbsolutePath, UserId } from '@novaos/filesystem';

export type TerminalOutputKind = 'stdout' | 'stderr' | 'system' | 'diagnostic';

export interface OutputLine {
  readonly kind: TerminalOutputKind;
  readonly text: string;
}

export const stdout = (text: string): OutputLine => ({ kind: 'stdout', text });
export const stderr = (text: string): OutputLine => ({ kind: 'stderr', text });
export const systemLine = (text: string): OutputLine => ({ kind: 'system', text });
export const diagnosticLine = (text: string): OutputLine => ({ kind: 'diagnostic', text });

// ---------------------------------------------------------------------------
// System inspection (read-only views of kernel state, supplied by the runtime)
// ---------------------------------------------------------------------------

export interface ProcessRow {
  readonly pid: number;
  readonly name: string;
  readonly state: string;
  readonly priority: number;
  readonly cpuTicks: number;
  readonly memoryBytes: number;
  readonly instructions: number;
}

export interface MemorySegmentRow {
  readonly kind: string;
  readonly base: number;
  readonly size: number;
  readonly ownerPid: number | null;
}

export interface MemorySummary {
  readonly totalBytes: number;
  readonly usedBytes: number;
  readonly freeBytes: number;
  readonly segments: MemorySegmentRow[];
}

export interface CpuSummary {
  readonly registers: ReadonlyArray<{ name: string; value: number }>;
  readonly flags: string;
}

export interface SysInfo {
  readonly version: string;
  readonly uptimeTicks: number;
  readonly processCount: number;
  readonly schedulerName: string;
  readonly totalMemoryBytes: number;
  readonly usedMemoryBytes: number;
}

export interface KillResult {
  readonly ok: boolean;
  readonly message: string;
}

/**
 * The read-only window the shell has into kernel state. The runtime backs this
 * with live kernel snapshots; the shell never imports the kernel directly.
 */
export interface SystemInspector {
  processes(): ProcessRow[];
  memory(): MemorySummary;
  cpu(): CpuSummary | null;
  sysinfo(): SysInfo;
  kill(pid: number): KillResult;
}

export interface StaticSystemData {
  readonly processes?: ProcessRow[];
  readonly memory?: MemorySummary;
  readonly cpu?: CpuSummary | null;
  readonly sysinfo: SysInfo;
}

/** A fixed-data inspector for standalone shells and tests. */
export function createStaticSystemInspector(data: StaticSystemData): SystemInspector {
  const memory = data.memory ?? { totalBytes: 0, usedBytes: 0, freeBytes: 0, segments: [] };
  return {
    processes: () => data.processes ?? [],
    memory: () => memory,
    cpu: () => data.cpu ?? null,
    sysinfo: () => data.sysinfo,
    kill: (pid) => ({ ok: false, message: `Cannot kill PID ${pid}: no live kernel attached.` }),
  };
}

// ---------------------------------------------------------------------------
// Program toolchain (compile / run), supplied by the runtime
// ---------------------------------------------------------------------------

export interface RunnerDiagnostic {
  readonly severity: string;
  readonly message: string;
  readonly line: number | null;
  readonly hint: string | null;
}

export interface CompileReport {
  readonly ok: boolean;
  readonly language: string;
  readonly instructionCount: number;
  readonly entryPoint: number;
  readonly diagnostics: RunnerDiagnostic[];
}

export interface RunReport {
  readonly ok: boolean;
  readonly output: string;
  readonly exitCode: number | null;
  readonly diagnostics: RunnerDiagnostic[];
}

/** Compiles and runs source files; backed by the assembler + kernel runtime. */
export interface ProgramRunner {
  compile(path: string, source: string): CompileReport;
  run(path: string, source: string): RunReport;
}

// ---------------------------------------------------------------------------
// Shell execution context + result
// ---------------------------------------------------------------------------

export interface ShellContext {
  readonly user: UserId;
  readonly cwd: AbsolutePath;
  readonly home: AbsolutePath;
  readonly filesystem: FileSystem;
  readonly clock: SimulationClock;
  readonly system?: SystemInspector;
  readonly runner?: ProgramRunner;
  readonly bus?: EventBus;
  readonly history?: readonly string[];
}

export interface CommandOutput {
  readonly exitCode: number;
  readonly lines: OutputLine[];
  /** A new working directory (set by `cd`). */
  readonly cwd?: AbsolutePath;
  /** Request the terminal to clear its buffer (set by `clear`). */
  readonly clear?: boolean;
}

export interface ShellExecutionResult {
  readonly command: string | null;
  readonly exitCode: number;
  readonly output: OutputLine[];
  readonly cwd: AbsolutePath;
  readonly clear: boolean;
}
