import { fsContext } from '@novaos/filesystem';
import type { ShellContext } from './context';
import type { CommandRegistry } from './registry';

export type CompletionKind = 'command' | 'file' | 'directory' | 'flag';

export interface CompletionItem {
  readonly value: string;
  readonly kind: CompletionKind;
}

export interface CompletionResult {
  /** The slice of input `[start, end)` that the chosen item replaces. */
  readonly replacement: { start: number; end: number };
  readonly items: CompletionItem[];
}

/**
 * Compute autocomplete candidates at a cursor position: command names for the
 * first word, otherwise filesystem path completions for the current argument.
 */
export function complete(
  input: string,
  cursor: number,
  context: ShellContext,
  registry: CommandRegistry,
): CompletionResult {
  const head = input.slice(0, cursor);
  const lastSpace = head.lastIndexOf(' ');
  const partial = head.slice(lastSpace + 1);
  const replacement = { start: lastSpace + 1, end: cursor };
  const isCommandPosition = head.trimStart().length === partial.length;

  if (isCommandPosition) {
    const items = registry
      .names()
      .filter((name) => name.startsWith(partial))
      .map((name) => ({ value: name, kind: 'command' as const }));
    return { replacement, items };
  }

  const slash = partial.lastIndexOf('/');
  const dir = slash >= 0 ? partial.slice(0, slash) || '/' : '.';
  const prefix = slash >= 0 ? partial.slice(slash + 1) : partial;
  const listing = context.filesystem.list(dir, fsContext(context.cwd, context.user));
  if (!listing.ok) return { replacement, items: [] };

  const items: CompletionItem[] = listing.value
    .filter((entry) => entry.name.startsWith(prefix))
    .map((entry) => ({
      value: slash >= 0 ? `${partial.slice(0, slash + 1)}${entry.name}` : entry.name,
      kind: entry.kind === 'directory' ? ('directory' as const) : ('file' as const),
    }));
  return { replacement, items };
}
