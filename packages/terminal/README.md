# @novaos/terminal

## Purpose

The headless terminal runtime: an interactive session model that owns the input
buffer, cursor, command history, output chunks, and autocomplete coordination,
and drives the shell. It is UI-free — a React terminal view (Milestone 7) renders
its state and forwards key events.

## Public API

- **`createTerminalSession(deps)` → `TerminalSession`** — `submit`, `setInput`/`insert`/
  `backspace`/`moveCursor`, `getOutput`, `getHistory`, `historyPrev`/`historyNext`,
  `complete`, `interrupt`, `clear`, `prompt`, `getCwd`.
- **`TerminalOutputChunk`**, `TerminalChunkKind`.

`deps` wires a `Shell`, a `FileSystem`, a `SimulationClock`, and optionally a
`SystemInspector` (for `ps`/`mem`/`cpu`/`sysinfo`) and an `EventBus`.

## Events

`terminal.command.submitted`, `terminal.output.appended`, `terminal.cleared`,
`terminal.interrupted`, `terminal.autocomplete.requested` (emitted to the bus when
present).

## Snapshots

The session state (input, cursor, history, output chunks) is plain, serializable data.

## Testing

Session unit tests (editing, history, interrupt, clear, autocomplete) and the
Milestone 3 acceptance demo, which boots a real kernel, wires its snapshots into a
`SystemInspector`, runs the command sequence, and asserts filesystem state, structured
output chunks, real `sysinfo`, events, and determinism.

## Dependency Rules

Depends on `@novaos/shell`, `@novaos/filesystem`, `@novaos/events`, `@novaos/shared`.
The kernel is a **dev-only** dependency used by the acceptance test to supply real
snapshots; the terminal runtime itself never imports the kernel. UI-free, deterministic.
