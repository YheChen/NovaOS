import type { SimulationClock } from '@novaos/shared';
import type { EventBus } from '@novaos/events';
import {
  DEFAULT_USER,
  DEFAULT_HOME,
  type AbsolutePath,
  type FileSystem,
  type UserId,
} from '@novaos/filesystem';
import type {
  Shell,
  ShellContext,
  ShellExecutionResult,
  SystemInspector,
  ProgramRunner,
  TerminalOutputKind,
  CompletionResult,
} from '@novaos/shell';
import * as events from './events';

export type TerminalChunkKind = TerminalOutputKind | 'prompt';

export interface TerminalOutputChunk {
  readonly id: string;
  readonly kind: TerminalChunkKind;
  readonly text: string;
  readonly tick: number;
}

export interface TerminalSessionDeps {
  readonly shell: Shell;
  readonly filesystem: FileSystem;
  readonly clock: SimulationClock;
  readonly system?: SystemInspector;
  readonly runner?: ProgramRunner;
  readonly bus?: EventBus;
  readonly user?: UserId;
  readonly home?: AbsolutePath;
  readonly cwd?: AbsolutePath;
  readonly id?: string;
  readonly title?: string;
}

export interface TerminalSession {
  readonly id: string;
  readonly title: string;
  getCwd(): AbsolutePath;
  getInput(): string;
  getCursor(): number;
  setInput(text: string): void;
  insert(text: string): void;
  backspace(): void;
  moveCursor(delta: number): void;
  getOutput(): readonly TerminalOutputChunk[];
  getHistory(): readonly string[];
  prompt(): string;
  submit(): ShellExecutionResult;
  historyPrev(): void;
  historyNext(): void;
  complete(): CompletionResult;
  interrupt(): void;
  clear(): void;
}

export function createTerminalSession(deps: TerminalSessionDeps): TerminalSession {
  const { shell, filesystem, clock } = deps;
  const id = deps.id ?? 'terminal-0';
  const title = deps.title ?? 'NovaOS Terminal';
  const user = deps.user ?? DEFAULT_USER;
  const home = deps.home ?? DEFAULT_HOME;

  let cwd: AbsolutePath = deps.cwd ?? home;
  let input = '';
  let cursor = 0;
  const history: string[] = [];
  let historyIndex: number | null = null;
  const output: TerminalOutputChunk[] = [];
  let chunkCounter = 0;

  const now = () => clock.now();
  const publish = (event: ReturnType<typeof events.clearedEvent>) => {
    if (deps.bus) deps.bus.publish(event);
  };

  function appendChunk(kind: TerminalChunkKind, text: string): void {
    output.push({ id: `chunk-${chunkCounter}`, kind, text, tick: now() });
    chunkCounter += 1;
  }

  function prompt(): string {
    return `${user}@novaos:${cwd}$`;
  }

  function shellContext(): ShellContext {
    return {
      user,
      cwd,
      home,
      filesystem,
      clock,
      history: [...history],
      system: deps.system,
      runner: deps.runner,
      bus: deps.bus,
    };
  }

  function submit(): ShellExecutionResult {
    const line = input;
    appendChunk('prompt', `${prompt()} ${line}`);
    if (line.trim() !== '') {
      history.push(line);
      publish(events.commandSubmittedEvent(now(), id, line));
    }

    const result = shell.execute(line, shellContext());

    if (result.clear) {
      output.length = 0;
      publish(events.clearedEvent(now(), id));
    } else {
      for (const chunk of result.output) appendChunk(chunk.kind, chunk.text);
      if (result.output.length > 0) {
        publish(events.outputAppendedEvent(now(), id, result.output.length));
      }
    }

    cwd = result.cwd;
    input = '';
    cursor = 0;
    historyIndex = null;
    return result;
  }

  return {
    id,
    title,
    getCwd: () => cwd,
    getInput: () => input,
    getCursor: () => cursor,
    setInput(text) {
      input = text;
      cursor = text.length;
    },
    insert(text) {
      input = input.slice(0, cursor) + text + input.slice(cursor);
      cursor += text.length;
    },
    backspace() {
      if (cursor > 0) {
        input = input.slice(0, cursor - 1) + input.slice(cursor);
        cursor -= 1;
      }
    },
    moveCursor(delta) {
      cursor = Math.max(0, Math.min(input.length, cursor + delta));
    },
    getOutput: () => output,
    getHistory: () => history,
    prompt,
    submit,
    historyPrev() {
      if (history.length === 0) return;
      historyIndex = historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1);
      input = history[historyIndex] ?? '';
      cursor = input.length;
    },
    historyNext() {
      if (historyIndex === null) return;
      if (historyIndex >= history.length - 1) {
        historyIndex = null;
        input = '';
        cursor = 0;
        return;
      }
      historyIndex += 1;
      input = history[historyIndex] ?? '';
      cursor = input.length;
    },
    complete() {
      publish(events.autocompleteRequestedEvent(now(), id, input));
      const result = shell.complete(input, cursor, shellContext());
      if (result.items.length === 1) {
        const item = result.items[0]!;
        input =
          input.slice(0, result.replacement.start) +
          item.value +
          input.slice(result.replacement.end);
        cursor = result.replacement.start + item.value.length;
      }
      return result;
    },
    interrupt() {
      appendChunk('prompt', `${prompt()} ${input}^C`);
      input = '';
      cursor = 0;
      historyIndex = null;
      publish(events.interruptedEvent(now(), id));
    },
    clear() {
      output.length = 0;
      publish(events.clearedEvent(now(), id));
    },
  };
}
