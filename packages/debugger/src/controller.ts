import type { CpuStepResult, RegisterFileSnapshot } from '@novaos/cpu';
import { createNovaRuntime, type NovaRuntime } from '@novaos/simulator';
import { diagnostic, processId, type ProcessId } from '@novaos/shared';
import { evaluateExpression } from './watch';
import type {
  Breakpoint,
  BreakpointId,
  CallStackFrame,
  DebugLocation,
  DebugProgram,
  DebuggerSnapshot,
  DebuggerState,
  PauseReason,
  ReplayConfig,
  TimelineSummary,
  WatchResult,
} from './types';

export interface DebugEventRecord {
  readonly type: string;
  readonly step: number;
}

export interface DebugController {
  getState(): DebuggerState;
  getSnapshot(): DebuggerSnapshot;
  getEventLog(): readonly DebugEventRecord[];

  // run control
  continueExecution(): DebuggerSnapshot;
  pause(): DebuggerSnapshot;
  stop(): DebuggerSnapshot;
  restart(): DebuggerSnapshot;

  // stepping
  stepInstruction(): DebuggerSnapshot;
  stepLine(): DebuggerSnapshot; // step over
  stepInto(): DebuggerSnapshot;
  stepOut(): DebuggerSnapshot;

  // breakpoints
  addLineBreakpoint(line: number): BreakpointId;
  addInstructionBreakpoint(address: number): BreakpointId;
  addConditionalBreakpoint(line: number, expression: string): BreakpointId;
  addExceptionBreakpoint(): BreakpointId;
  addMemoryBreakpoint(address: number): BreakpointId;
  removeBreakpoint(id: BreakpointId): boolean;
  setBreakpointEnabled(id: BreakpointId, enabled: boolean): boolean;
  listBreakpoints(): Breakpoint[];

  // watches
  addWatch(expression: string): void;
  removeWatch(expression: string): void;
  listWatches(): string[];

  // time travel
  stepBack(): DebuggerSnapshot;
  jumpToStep(step: number): DebuggerSnapshot;

  // address/line helpers (for UI + tests)
  lineForAddress(address: number): number | null;
  addressesForLine(line: number): number[];
}

const DEFAULT_MAX_STEPS = 200_000;

export function createDebugger(program: DebugProgram, config: ReplayConfig = {}): DebugController {
  const maxSteps = config.maxSteps ?? DEFAULT_MAX_STEPS;

  // Address ↔ source line maps.
  const entries =
    program.lineMap ??
    program.bytecode.sourceMap.entries.map((e) => ({ address: e.address, line: e.line }));
  const addrToLine = new Map<number, number>();
  const lineToAddrs = new Map<number, number[]>();
  for (const { address, line } of entries) {
    if (!addrToLine.has(address)) addrToLine.set(address, line);
    const list = lineToAddrs.get(line) ?? [];
    list.push(address);
    lineToAddrs.set(line, list);
  }
  const lineForAddress = (address: number): number | null => addrToLine.get(address) ?? null;
  const addressesForLine = (line: number): number[] => lineToAddrs.get(line) ?? [];

  // Function symbols (block labels contain "_bb"; everything else is a function).
  const funcSymbols = program.bytecode.symbols.symbols
    .filter((s) => !s.name.includes('_bb'))
    .slice()
    .sort((a, b) => a.address - b.address);
  const funcAt = (address: number): string => {
    let name = '?';
    for (const s of funcSymbols) {
      if (s.address <= address) name = s.name;
      else break;
    }
    return name;
  };

  const breakpoints = new Map<BreakpointId, Breakpoint>();
  let nextBpId = 1;
  const watches: string[] = [];
  const eventLog: DebugEventRecord[] = [];

  // Mutable runtime state.
  let runtime!: NovaRuntime;
  let pid: ProcessId = processId(0);
  // The kernel loads code at a base address; bytecode/source-map addresses are
  // relative. `base` converts an absolute runtime PC into the relative space so
  // breakpoints, source maps, and symbols all line up.
  let base = 0;
  let state: DebuggerState = 'idle';
  let pauseReason: PauseReason = 'entry';
  let currentStep = 0;
  let depth = 0;
  let currentPc = 0; // relative address

  const log = (type: string): void => {
    eventLog.push({ type, step: currentStep });
  };
  // Read through a function so TS does not over-narrow the closure variable.
  const isTerminated = (): boolean => state === 'terminated';
  const toRel = (absolute: number): number => absolute - base;

  function buildRuntime(): void {
    runtime = createNovaRuntime({ scheduler: 'fifo', seed: 1, maxSteps });
    runtime.boot();
    pid = runtime.spawn('debuggee', {
      entryPoint: program.bytecode.entryPoint,
      code: program.bytecode.code,
    });
    const pcb = runtime.getKernel().getProcess(pid);
    const entryAbsolute = pcb ? pcb.registers.pc : 0;
    base = entryAbsolute - program.bytecode.entryPoint;
    currentPc = program.bytecode.entryPoint;
    currentStep = 0;
    depth = 0;
    state = 'loaded';
    pauseReason = 'entry';
  }

  function registers(): RegisterFileSnapshot {
    // Before the first dispatch the live CPU is zeroed; use the PCB's entry regs.
    if (currentStep === 0) {
      const pcb = runtime.getKernel().getProcess(pid);
      if (pcb) return pcb.registers;
    }
    return runtime.getRegisters();
  }

  function exitCode(): number | null {
    return runtime.getKernel().getProcess(pid)?.exitCode ?? null;
  }

  interface StepOutcome {
    readonly result: CpuStepResult;
    readonly newEvents: ReturnType<NovaRuntime['getEvents']>;
    readonly terminated: boolean;
  }

  /** Execute one instruction, updating depth/pc/state. Returns null at the end. */
  function rawStep(): StepOutcome | null {
    if (isTerminated()) return null;
    const before = runtime.getEvents();
    const result = runtime.step();
    if (result === null) {
      state = 'terminated';
      pauseReason = 'terminated';
      return null;
    }
    currentStep += 1;
    const mnemonic = result.instruction?.mnemonic;
    if (mnemonic === 'CALL') depth += 1;
    else if (mnemonic === 'RET') depth = Math.max(0, depth - 1);

    currentPc = toRel(runtime.getRegisters().pc);
    const newEvents = runtime.getEvents().slice(before.length);

    let terminated = false;
    if (result.status === 'halted') {
      state = 'terminated';
      pauseReason = 'terminated';
      terminated = true;
    } else if (result.status === 'fault') {
      state = 'terminated';
      pauseReason = 'exception';
      terminated = true;
    }
    return { result, newEvents, terminated };
  }

  function evalTruthy(expression: string): boolean {
    const r = evaluateExpression(expression, {
      registers: registers(),
      readWord: runtime.readWord,
    });
    return r.ok && r.value !== 0;
  }

  function breakpointHit(
    result: CpuStepResult,
    newEvents: ReturnType<NovaRuntime['getEvents']>,
  ): Breakpoint | null {
    const line = lineForAddress(currentPc);
    for (const bp of breakpoints.values()) {
      if (!bp.enabled) continue;
      switch (bp.kind) {
        case 'instruction':
          if (bp.address === currentPc) return bp;
          break;
        case 'line':
          if (line !== null && bp.line === line) return bp;
          break;
        case 'conditional':
          if (line !== null && bp.line === line && evalTruthy(bp.expression)) return bp;
          break;
        case 'exception':
          if (result.status === 'fault') return bp;
          break;
        case 'memory':
          if (
            newEvents.some(
              (e) =>
                e.type === 'cpu.memory.written' &&
                (e.payload as { address: number }).address === bp.address,
            )
          )
            return bp;
          break;
      }
    }
    return null;
  }

  /**
   * Drive execution forward. Breakpoints on `ignoreLine` are skipped until we
   * first leave that contiguous line region, so `continue`/step move past the
   * breakpoint they are currently parked on (and re-arm it for loops).
   */
  function runLoop(stopAfterStep: () => boolean, ignoreLine: number | null): void {
    state = 'running';
    let left = ignoreLine === null;
    let steps = 0;
    for (;;) {
      const stepped = rawStep();
      if (stepped === null || stepped.terminated) return;
      if (!left && currentLine() !== ignoreLine) left = true;
      if (left) {
        const hit = breakpointHit(stepped.result, stepped.newEvents);
        if (hit) {
          state = 'paused';
          pauseReason = 'breakpoint';
          log('breakpoint.hit');
          return;
        }
      }
      if (stopAfterStep()) {
        state = 'paused';
        return;
      }
      steps += 1;
      if (steps >= maxSteps) {
        state = 'paused';
        pauseReason = 'paused';
        return;
      }
    }
  }

  function currentLine(): number | null {
    return lineForAddress(currentPc);
  }

  // --- Call stack ----------------------------------------------------------
  function buildCallStack(): CallStackFrame[] {
    const regs = registers();
    const frames: CallStackFrame[] = [];
    let bp = regs.bp; // absolute stack address
    let framePc = currentPc; // relative code address
    for (let i = 0; i < 64; i += 1) {
      const retAbs = runtime.readWord(bp + 4);
      const ret = retAbs === null ? null : toRel(retAbs);
      const name = funcAt(framePc);
      frames.push({
        index: i,
        functionName: name,
        returnAddress: ret,
        basePointer: bp,
        stackPointer: regs.sp,
        currentAddress: framePc,
        sourceLine: lineForAddress(framePc),
      });
      if (name === '_start' || retAbs === null) break;
      const savedBp = runtime.readWord(bp);
      if (savedBp === null || savedBp <= bp) break; // stack grows down; caller BP is higher
      framePc = toRel(retAbs);
      bp = savedBp;
    }
    return frames;
  }

  // --- Watches -------------------------------------------------------------
  function evaluateWatches(): WatchResult[] {
    return watches.map((expression) => {
      const r = evaluateExpression(expression, {
        registers: registers(),
        readWord: runtime.readWord,
      });
      if (r.ok) {
        return { expression, value: String(r.value), type: 'int', available: true };
      }
      return {
        expression,
        value: '<unavailable>',
        type: 'unknown',
        available: false,
        diagnostic: diagnostic({ severity: 'warning', code: 'debug/watch-eval', message: r.error }),
      };
    });
  }

  // --- Timeline ------------------------------------------------------------
  function timeline(): TimelineSummary {
    const events = runtime.getEvents();
    const eventsByType: Record<string, number> = {};
    for (const e of events) eventsByType[e.type] = (eventsByType[e.type] ?? 0) + 1;
    return { cursor: currentStep, eventCount: events.length, eventsByType };
  }

  function currentLocation(): DebugLocation | null {
    return { address: currentPc, sourceLine: lineForAddress(currentPc) };
  }

  function snapshot(): DebuggerSnapshot {
    return {
      state,
      pauseReason,
      currentLocation: currentLocation(),
      registers: registers(),
      callStack: buildCallStack(),
      watches: evaluateWatches(),
      breakpoints: [...breakpoints.values()],
      timeline: timeline(),
      output: runtime.getOutput(),
      exitCode: exitCode(),
    };
  }

  function seekToStep(target: number): void {
    const clamped = Math.max(0, target);
    buildRuntime();
    state = 'paused';
    pauseReason = clamped === 0 ? 'entry' : 'step';
    for (let s = 0; s < clamped; s += 1) {
      const stepped = rawStep();
      if (stepped === null || stepped.terminated) break;
    }
  }

  // Initialize.
  buildRuntime();
  state = 'loaded';
  pauseReason = 'entry';
  log('session.started');

  return {
    getState: () => state,
    getSnapshot: snapshot,
    getEventLog: () => eventLog,

    continueExecution() {
      if (isTerminated()) return snapshot();
      log('continued');
      runLoop(() => false, currentLine());
      return snapshot();
    },
    pause() {
      // Synchronous stepping model: a no-op signal that we are paused.
      if (!isTerminated()) state = 'paused';
      return snapshot();
    },
    stop() {
      state = 'terminated';
      pauseReason = 'terminated';
      log('session.ended');
      return snapshot();
    },
    restart() {
      seekToStep(0);
      state = 'loaded';
      pauseReason = 'entry';
      log('session.started');
      return snapshot();
    },

    stepInstruction() {
      const stepped = rawStep();
      if (stepped && !stepped.terminated) {
        const hit = breakpointHit(stepped.result, stepped.newEvents);
        state = 'paused';
        pauseReason = hit ? 'breakpoint' : 'step';
      }
      log('step.instruction');
      return snapshot();
    },
    stepLine() {
      const startLine = currentLine();
      const startDepth = depth;
      runLoop(
        () => depth <= startDepth && currentLine() !== null && currentLine() !== startLine,
        startLine,
      );
      if (!isTerminated()) pauseReason = pauseReason === 'breakpoint' ? 'breakpoint' : 'step';
      log('step.line');
      return snapshot();
    },
    stepInto() {
      const startLine = currentLine();
      runLoop(() => currentLine() !== null && currentLine() !== startLine, startLine);
      if (!isTerminated()) pauseReason = pauseReason === 'breakpoint' ? 'breakpoint' : 'step';
      log('step.into');
      return snapshot();
    },
    stepOut() {
      const startLine = currentLine();
      const startDepth = depth;
      runLoop(() => depth < startDepth, startLine);
      if (!isTerminated()) pauseReason = pauseReason === 'breakpoint' ? 'breakpoint' : 'step';
      log('step.out');
      return snapshot();
    },

    addLineBreakpoint(line) {
      const id = nextBpId++;
      breakpoints.set(id, { id, kind: 'line', line, enabled: true });
      return id;
    },
    addInstructionBreakpoint(address) {
      const id = nextBpId++;
      breakpoints.set(id, { id, kind: 'instruction', address, enabled: true });
      return id;
    },
    addConditionalBreakpoint(line, expression) {
      const id = nextBpId++;
      breakpoints.set(id, { id, kind: 'conditional', line, expression, enabled: true });
      return id;
    },
    addExceptionBreakpoint() {
      const id = nextBpId++;
      breakpoints.set(id, { id, kind: 'exception', enabled: true });
      return id;
    },
    addMemoryBreakpoint(address) {
      const id = nextBpId++;
      breakpoints.set(id, { id, kind: 'memory', address, access: 'write', enabled: true });
      return id;
    },
    removeBreakpoint: (id) => breakpoints.delete(id),
    setBreakpointEnabled(id, enabled) {
      const bp = breakpoints.get(id);
      if (!bp) return false;
      bp.enabled = enabled;
      return true;
    },
    listBreakpoints: () => [...breakpoints.values()],

    addWatch(expression) {
      if (!watches.includes(expression)) watches.push(expression);
    },
    removeWatch(expression) {
      const i = watches.indexOf(expression);
      if (i >= 0) watches.splice(i, 1);
    },
    listWatches: () => [...watches],

    stepBack() {
      seekToStep(currentStep - 1);
      log('timeline.rewind');
      return snapshot();
    },
    jumpToStep(step) {
      seekToStep(step);
      log('timeline.jump');
      return snapshot();
    },

    lineForAddress,
    addressesForLine,
  };
}
