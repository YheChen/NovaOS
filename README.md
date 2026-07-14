<div align="center">

# NovaOS

**A browser-based, deterministic operating-systems laboratory.**

Write a small program, compile it through a real toolchain, run it on a custom
virtual machine, and watch every layer of an operating system work - registers
mutating, memory paging, processes scheduling, syscalls crossing into the
kernel - then step the whole thing **backwards** through a reproducible timeline.

[![CI](https://github.com/YheChen/NovaOS/actions/workflows/ci.yml/badge.svg)](https://github.com/YheChen/NovaOS/actions/workflows/ci.yml)
[![E2E](https://github.com/YheChen/NovaOS/actions/workflows/e2e.yml/badge.svg)](https://github.com/YheChen/NovaOS/actions/workflows/e2e.yml)
[![Live demo](https://img.shields.io/badge/demo-live-2ea44f)](https://yhechen.github.io/NovaOS/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](#license)

### ▶ [Try it live](https://yhechen.github.io/NovaOS/) - no install required

</div>

---

NovaOS makes the invisible parts of an operating system **visible**. It takes a
program from source to silicon and lets you inspect and manipulate every layer in
between: the compiler pipeline, the instruction set, physical and virtual memory,
the process scheduler, concurrency primitives, the filesystem, and a time-travel
debugger.

It is built like a serious systems project, not a toy: a **deterministic**
simulation engine written in pure TypeScript, with a DevTools-style web workspace
layered on top. The simulator core owns the truth; the UI only ever observes
serializable snapshots and typed events. Because the engine is deterministic (a
seeded PRNG and an injected clock, never wall-clock time or `Math.random()`),
**any run can be replayed exactly** - which is what makes reverse debugging,
golden tests, and reproducible race conditions possible.

> [!TIP]
> New here? Open the [**live workspace**](https://yhechen.github.io/NovaOS/),
> press **Compile** to watch `hello.c` lower through every stage, **Run** to print
> `15`, then **Debug → Step into** to walk the program line by line while
> registers and the call stack update. See [`docs/demo.md`](docs/demo.md) for a
> 30-second tour.

<!-- Add a screencast at docs/media/demo.gif and uncomment:
<div align="center"><img src="docs/media/demo.gif" alt="NovaOS demo" width="820"></div>
-->

## From source to silicon

Every stage below is real, inspectable, and covered by tests:

```
Toy C  ──►  tokens  ──►  AST  ──►  semantic analysis  ──►  NovaIR  ──►  optimization
       ──►  NovaASM  ──►  assembler  ──►  bytecode  ──►  NovaVM (CPU + kernel + memory)
       ──►  registers / memory / scheduler / syscalls  ──►  debugger + time-travel replay
```

## Highlights

- **A custom virtual machine.** A fixed-width 32-bit ISA (arithmetic, logic,
  bitwise, control flow, syscalls) with a fetch → decode → execute → write-back
  core, a full register file with FLAGS, and byte-addressable RAM.
- **A real toolchain.** A NovaASM assembler and a **Toy C compiler** - lexer,
  recursive-descent parser with error recovery, a type checker, an IR in basic
  blocks, optimization passes (constant folding, copy propagation, dead-code
  elimination), a stack-based code generator, and complete source maps.
- **A microkernel.** Boot lifecycle, process control blocks, timer interrupts and
  context switches, a syscall trap, a process fault model, and a `malloc`/`free`
  heap.
- **Seven schedulers.** FIFO, Round-Robin, Priority, Lottery, SJF, SRTF, and a
  Multi-Level Feedback Queue - plus a workload simulator that races all of them on
  identical jobs and charts turnaround, waiting, response, throughput, and context
  switches.
- **Virtual memory.** A page-table MMU with VA decode, demand paging, FIFO and
  Clock (second-chance) replacement, and an optional TLB. The CPU can optionally
  route every access through it.
- **Concurrency.** Deterministic mutex and counting semaphore, and a replayable
  "lost update" race demonstration that a lock provably fixes.
- **A time-travel debugger.** Run / pause / continue / restart, step
  instruction / over / into / out, line + instruction + conditional + exception +
  memory breakpoints, a safe watch-expression evaluator (no `eval`), call-stack
  reconstruction, an event timeline, and **stepping backwards**.
- **A filesystem that persists.** An inode VFS with a path resolver and
  permissions, snapshot/restore, and durable persistence to IndexedDB in the
  browser.
- **Guided tutorials.** A dataset of interactive walkthroughs with typed
  checkpoints the app verifies against the real engine - the same verifier backs
  a cross-subsystem regression test.

## Explore it in the browser

The workspace is a single-page app built entirely on the domain packages - it
renders real snapshots and events, never mocked state. It ships six views:

| View                 | What you do                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Workspace**        | Edit Toy C in a Monaco editor, compile through every stage in the inspector, run on the VM, and drive the live time-travel debugger (registers, stack, heap, CFG). |
| **Scheduler Lab**    | Run one workload through all seven algorithms and compare metrics + a Gantt timeline.                                                                              |
| **Paging**           | Translate a virtual address and watch the page-table walk, frame allocation, TLB, and page faults step by step.                                                    |
| **Concurrency Lab**  | Watch a data race lose updates, then add a lock and watch it become correct - deterministically.                                                                   |
| **Files**            | Create, edit, and delete files in a virtual filesystem that survives a page reload.                                                                                |
| **Guided Tutorials** | Work through checkpointed lessons spanning the compiler, debugger, heap, concurrency, scheduling, and virtual memory.                                              |

## The Toy C language

Small but real. The compiler supports:

- `int` and `bool` types, variables, and functions (including **recursion**)
- full arithmetic with correct operator precedence, and bitwise operators
  (`& | ^ << >>`)
- `if` / `else`, `while`, and `for` with compound assignment (`+=`, `-=`, ...)
- short-circuiting `&&` / `||`
- fixed-size arrays (`int a[N]`, `a[i]`) and dynamic memory
  (`malloc` / `free` / `peek` / `poke`)

```c
int fib(int n) {
  if (n < 2) { return n; }
  return fib(n - 1) + fib(n - 2);
}

int main() {
  print(fib(10));   // 55
  return 0;
}
```

## Architecture

```
Presentation        apps/web            Vite + React workspace SPA
Simulation runtime  @novaos/simulator   boot, ticking, snapshots, replay, opt-in paging
Domain              @novaos/{cpu, memory, kernel, scheduler, mmu, concurrency,
                    filesystem, shell, terminal, assembler, compiler, debugger}
Shared              @novaos/shared (primitives) · @novaos/events (event bus)
Content             @novaos/examples · @novaos/tutorials
```

Three principles hold the system together and are **mechanically enforced** by
`pnpm check:arch` on every commit:

1. **Dependencies point downward and the graph is acyclic.** Every package
   exposes its public API through a single `src/index.ts`; deep imports are
   forbidden.
2. **Domain packages are UI-free.** No React, DOM, or Monaco below the
   presentation layer. The UI owns no domain truth - it subscribes to snapshots
   and events.
3. **Domain packages are deterministic.** No `Math.random()`, no `Date.now()`.
   Randomness comes from a seeded PRNG and time from an injected clock, so every
   run is reproducible and replayable.

See [`docs/adr/`](docs/adr) for the decisions behind the ISA and calling
convention, the UI stack, and the kernel/runtime split.

### Monorepo layout

| Package                                  | Responsibility                                                        |
| ---------------------------------------- | --------------------------------------------------------------------- |
| `@novaos/shared`                         | Branded ids, `Result`, seeded PRNG, injected clock, diagnostics       |
| `@novaos/events`                         | Typed event bus and recorder                                          |
| `@novaos/cpu`                            | 32-bit ISA, register file, fetch/decode/execute, syscall trap         |
| `@novaos/memory`                         | Flat byte-addressable RAM, segments, first-fit allocator              |
| `@novaos/kernel`                         | Boot, PCBs, timer interrupts, syscalls, process heap                  |
| `@novaos/scheduler`                      | Seven scheduling algorithms + a workload comparison simulator         |
| `@novaos/mmu`                            | Page tables, VA decode, demand paging (FIFO/Clock), TLB               |
| `@novaos/concurrency`                    | Mutex, semaphore, and a deterministic race demonstration              |
| `@novaos/filesystem`                     | Inode VFS, path resolver, permissions, snapshot/restore               |
| `@novaos/shell` · `@novaos/terminal`     | Shell builtins and a terminal session runtime                         |
| `@novaos/assembler`                      | NovaASM → bytecode                                                    |
| `@novaos/compiler`                       | Toy C: lexer → parser → sema → IR → optimizer → codegen + source maps |
| `@novaos/debugger`                       | Stepping, breakpoints, watches, call stack, time-travel replay        |
| `@novaos/simulator`                      | Wires the machine together; ticking, snapshots, opt-in MMU paging     |
| `@novaos/examples` · `@novaos/tutorials` | Curated tested programs and guided lessons                            |
| `@novaos/testing` · `@novaos/ui`         | Shared test helpers and domain-agnostic UI primitives                 |

## Getting started

**Requirements:** Node `>= 20` and [pnpm](https://pnpm.io/).

```bash
git clone https://github.com/YheChen/NovaOS.git
cd NovaOS
pnpm install

# Run the full quality gate (format, lint, typecheck, tests, build, arch check)
pnpm validate

# Launch the workspace at http://localhost:3000
pnpm --filter @novaos/web dev
```

## Testing and quality gates

NovaOS is verified at several tiers. CI runs them on every pull request, and the
flagship end-to-end flow runs against the built SPA.

| Gate                          | Command                                                           |
| ----------------------------- | ----------------------------------------------------------------- |
| Format · Lint · Typecheck     | `pnpm format:check` · `pnpm lint` · `pnpm typecheck`              |
| Unit tests                    | `pnpm test`                                                       |
| Integration · Golden · Replay | `pnpm test:integration` · `pnpm test:golden` · `pnpm test:replay` |
| Build                         | `pnpm build`                                                      |
| Architecture boundaries       | `pnpm check:arch`                                                 |
| End-to-end (Playwright)       | `pnpm test:e2e`                                                   |
| Everything                    | `pnpm validate`                                                   |

The **replay** and **golden** tiers are the payoff of determinism: a recorded run
must reproduce byte-for-byte, and the compiler's output for every example program
is frozen and diffed. Guided-tutorial checkpoints double as a cross-subsystem
oracle - if a compiler or VM change alters an example's output, the tutorials go
red.

## Tech stack

TypeScript (strict) · pnpm workspaces · Turborepo · tsup · Vite · React · Monaco
· Vitest · Playwright · ESLint (flat config) · Prettier.

## Documentation

- [`docs/specs/`](docs/specs) - the authoritative subsystem specifications
- [`docs/adr/`](docs/adr) - architecture decision records
- [`docs/orchestration/`](docs/orchestration) - task registry, quality gates, risks
- [`docs/release-notes/`](docs/release-notes) - release history
- [`docs/contributing.md`](docs/contributing.md) - contribution guide

## Contributing

Contributions are welcome. Please read
[`docs/contributing.md`](docs/contributing.md), keep `pnpm validate` green, and
respect the three architecture principles above (they are enforced in CI, so a
violation will fail the build before review).

## License

Released under the MIT License.
