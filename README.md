# NovaOS

> A browser-based, deterministic operating-systems laboratory. **v1.0**

NovaOS makes the invisible parts of an operating system **visible**. Write a small
program, compile it through a real toolchain, run it inside a simulated machine,
and watch CPU registers mutate, memory change, processes get scheduled, syscalls
cross into the kernel, and execution replay **backwards** through a deterministic
timeline.

It is built like a serious systems project: a deterministic simulation engine in
pure TypeScript, with a DevTools-style web workspace layered on top. The simulator
core owns truth; the UI only observes serializable snapshots and typed events.

---

## What it does

NovaOS takes a program from source to silicon and lets you inspect every layer:

```
Toy C  →  tokens  →  AST  →  semantic analysis  →  NovaIR  →  optimization
       →  NovaASM  →  assembler  →  bytecode  →  NovaVM (CPU + kernel + memory)
       →  registers / memory / scheduler / syscalls  →  debugger + time-travel
```

- **Custom VM** — a 32-bit fixed-width ISA (30 opcodes), fetch→decode→execute→
  write-back pipeline, FLAGS, byte-addressable RAM, first-fit allocator, segments.
- **Microkernel** — boot lifecycle, PCBs, FIFO/Round-Robin scheduling, timer
  interrupts + context switches, a syscall trap, and a process fault model.
- **Filesystem + shell + terminal** — an inode VFS, path resolver, 21 shell
  builtins, and a terminal session runtime.
- **Toolchain** — a NovaASM assembler and a **Toy C compiler** (lexer, parser,
  type checker, IR, constant-folding / copy-propagation / dead-code-elimination,
  a stack-based code generator, and full source maps).
- **Debugger** — run/pause/continue/restart, step instruction / over / into /
  out, line + instruction + conditional + exception + memory breakpoints, a safe
  watch-expression evaluator (no `eval`), call-stack reconstruction, an event
  timeline, and **deterministic time-travel replay**.
- **Workspace UI** — a Vite + React SPA: editor, compile-stage inspector, run
  output, and a live debugger panel — all driven by the real domain packages.

## Quickstart

```bash
pnpm install
pnpm validate          # format + lint + typecheck + tests + build + arch check
pnpm --filter @novaos/web dev   # open the workspace at http://localhost:3000
```

Try it: in the workspace, press **Compile** to see `hello.c` lowered through every
stage, **Run** to print `15`, then **Debug** and **Step into** to walk the program
line by line while registers and the call stack update live.

## The flagship demo

```c
int main() {
  int a = 5;
  int b = 10;
  int c = a + b;
  print(c);
  return 0;
}
```

`compile hello.c` → inspect tokens/AST/IR/assembly/bytecode → `run hello.c` →
`15`. The bundled examples also cover arithmetic precedence, `while` loops,
`if/else`, and **recursion** (`fib(10) = 55`).

## Architecture

```
Presentation        apps/web — Vite + React workspace SPA
Simulation Runtime  @novaos/simulator — boot, ticking, snapshots, replay
Domain              @novaos/{cpu, memory, kernel, scheduler, filesystem,
                    shell, terminal, assembler, compiler, debugger}
Shared              @novaos/shared (primitives), @novaos/events (event bus)
Content             @novaos/examples — tested example programs
```

Dependency direction is strictly downward. Domain packages are **UI-free** (no
React/DOM/Monaco) and **deterministic** (no `Math.random()` / `Date.now()`; a
seeded PRNG and an injected clock instead). The UI owns no domain truth — it
renders snapshots and events. Every package exports only through `src/index.ts`,
the graph is acyclic, and all of this is enforced by `pnpm check:arch`.

See [`docs/adr/`](docs/adr) for the key decisions (ISA extension + calling
convention, UI stack, kernel/runtime split) and
[`docs/orchestration/`](docs/orchestration) for the build plan and quality gates.

## Quality gates

| Gate                          | Command                                                           |
| ----------------------------- | ----------------------------------------------------------------- |
| Format / Lint / Typecheck     | `pnpm format:check` · `pnpm lint` · `pnpm typecheck`              |
| Unit tests                    | `pnpm test`                                                       |
| Integration / Golden / Replay | `pnpm test:integration` · `pnpm test:golden` · `pnpm test:replay` |
| Build                         | `pnpm build`                                                      |
| Architecture                  | `pnpm check:arch`                                                 |
| E2E                           | `pnpm test:e2e`                                                   |

CI runs the gates on every PR; the flagship E2E flow runs against the built SPA.

## Tech stack

TypeScript (strict) · pnpm workspaces · Turborepo · tsup · Vite · React · Vitest ·
Playwright · ESLint (flat) · Prettier.

## Documentation

- [`docs/specs/`](docs/specs) — the 10 authoritative specifications
- [`docs/adr/`](docs/adr) — architecture decision records
- [`docs/orchestration/`](docs/orchestration) — task registry, quality gates, risks
- [`docs/release-notes/`](docs/release-notes) — release notes

## License

MIT.
