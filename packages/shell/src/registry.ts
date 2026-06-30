import type { CommandNode } from './parser';
import type { CommandOutput, ShellContext } from './context';

export interface CommandOptionSpec {
  readonly flag: string;
  readonly alias?: string;
  readonly description: string;
}

export interface ParsedArgs {
  readonly positional: string[];
  readonly flags: Set<string>;
}

export interface ShellCommand {
  readonly name: string;
  readonly summary: string;
  readonly usage: string;
  readonly aliases: string[];
  readonly options: CommandOptionSpec[];
  run(args: ParsedArgs, context: ShellContext): CommandOutput;
}

export interface CommandRegistry {
  register(command: ShellCommand): void;
  get(name: string): ShellCommand | null;
  list(): ShellCommand[];
  names(): string[];
}

export function createCommandRegistry(): CommandRegistry {
  const byName = new Map<string, ShellCommand>();
  const aliasToName = new Map<string, string>();

  return {
    register(command) {
      byName.set(command.name, command);
      for (const alias of command.aliases) aliasToName.set(alias, command.name);
    },
    get(name) {
      const direct = byName.get(name);
      if (direct) return direct;
      const aliased = aliasToName.get(name);
      return aliased ? (byName.get(aliased) ?? null) : null;
    },
    list: () => [...byName.values()].sort((a, b) => (a.name < b.name ? -1 : 1)),
    names: () => [...byName.keys()].sort(),
  };
}

/** Turn the parsed command AST into positional args + a flag set. */
export function parseArgs(command: CommandNode): ParsedArgs {
  const positional: string[] = [];
  const flags = new Set<string>();
  for (const arg of command.args) {
    if (!arg.isFlag) {
      positional.push(arg.value);
      continue;
    }
    if (arg.value.startsWith('--')) {
      flags.add(arg.value.slice(2));
    } else {
      // -rf => r, f
      for (const ch of arg.value.slice(1)) flags.add(ch);
    }
  }
  return { positional, flags };
}
