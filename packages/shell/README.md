# @novaos/shell

## Purpose

The NovaShell command language: a lexer, parser, command registry, and the
Milestone 3 built-in commands. The shell parses a command line and executes one
command against the virtual filesystem and (optionally) a read-only view of
kernel state.

## Public API

- **`createShell()` → `Shell`** - `execute(input, context)` and
  `complete(input, cursor, context)`, plus the `registry`.
- **Lexer/parser:** `lex`, `parse`, `CommandLineNode`, `CommandNode`, `ShellArgument`.
- **Registry:** `createCommandRegistry`, `ShellCommand`, `ParsedArgs`, `parseArgs`,
  `registerBuiltins`.
- **Context:** `ShellContext`, `ShellExecutionResult`, `OutputLine`, output helpers,
  and `SystemInspector` / `createStaticSystemInspector`.
- **Completion:** `complete`, `CompletionResult`, `CompletionItem`.
- **Suggestions:** `editDistance`, `suggest`.

Built-ins: `pwd cd ls tree mkdir touch cat rm cp mv echo clear help history ps kill
mem cpu sysinfo`.

## Events

Emitted to the bus in `ShellContext` (when present): `shell.command.started`,
`shell.command.finished`, `shell.command.failed`, `shell.cwd.changed`. Filesystem
mutations emit `filesystem.*` events via the filesystem's own bus.

## Snapshots

None - the shell is stateless across calls; cwd/history live in the terminal session.

## Testing

Lexer/parser unit tests, the acceptance command sequence, command-not-found
suggestions, system commands over a static inspector, `rm -r` semantics, event
emission, and autocomplete.

## Dependency Rules

Depends on `@novaos/filesystem`, `@novaos/events`, `@novaos/shared`. Does **not**
import the kernel - system inspection goes through the injected `SystemInspector`.
UI-free and deterministic.
