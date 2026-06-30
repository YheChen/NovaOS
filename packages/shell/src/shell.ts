import { parse } from './parser';
import { createCommandRegistry, parseArgs, type CommandRegistry } from './registry';
import { registerBuiltins } from './builtins';
import { suggest } from './suggestions';
import { complete, type CompletionResult } from './completion';
import {
  diagnosticLine,
  type OutputLine,
  type ShellContext,
  type ShellExecutionResult,
} from './context';
import * as events from './events';

export interface Shell {
  readonly registry: CommandRegistry;
  execute(input: string, context: ShellContext): ShellExecutionResult;
  complete(input: string, cursor: number, context: ShellContext): CompletionResult;
}

export function createShell(): Shell {
  const registry = createCommandRegistry();
  registerBuiltins(registry);

  function execute(input: string, context: ShellContext): ShellExecutionResult {
    const publish = (event: ReturnType<typeof events.commandStartedEvent>) => {
      if (context.bus) context.bus.publish(event);
    };
    const tick = context.clock.now();
    const empty: ShellExecutionResult = {
      command: null,
      exitCode: 0,
      output: [],
      cwd: context.cwd,
      clear: false,
    };

    if (input.trim() === '') return empty;

    const parsed = parse(input);
    if (!parsed.ok) {
      const message = parsed.error.message;
      publish(events.commandFailedEvent(tick, input.trim().split(' ')[0] ?? '', message));
      return { ...empty, exitCode: 2, output: [diagnosticLine(message)] };
    }
    if (parsed.value.commands.length === 0) return empty;

    const node = parsed.value.commands[0]!;
    const command = registry.get(node.name);
    if (!command) {
      const suggestion = suggest(node.name, registry.names());
      const lines: OutputLine[] = [diagnosticLine(`Command not found: ${node.name}`)];
      if (suggestion) lines.push(diagnosticLine(`Hint: Did you mean \`${suggestion}\`?`));
      publish(events.commandFailedEvent(tick, node.name, 'command not found'));
      return { ...empty, command: null, exitCode: 127, output: lines };
    }

    publish(events.commandStartedEvent(tick, command.name, input));
    const result = command.run(parseArgs(node), context);
    publish(events.commandFinishedEvent(context.clock.now(), command.name, result.exitCode));

    const cwd = result.cwd ?? context.cwd;
    if (result.cwd && result.cwd !== context.cwd) {
      publish(events.cwdChangedEvent(context.clock.now(), context.cwd, result.cwd));
    }

    return {
      command: command.name,
      exitCode: result.exitCode,
      output: result.lines,
      cwd,
      clear: result.clear ?? false,
    };
  }

  return {
    registry,
    execute,
    complete: (input, cursor, context) => complete(input, cursor, context, registry),
  };
}
