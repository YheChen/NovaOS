# Task Registry & Status Dashboard

Status as of the v1.0.0 release (all milestones M0-M10 complete). Legend: ✅ done · 🟡 partial · ⬜ planned.

## Milestone status

| Milestone | Scope                                                                     | Status | Evidence                                                     |
| --------- | ------------------------------------------------------------------------- | ------ | ------------------------------------------------------------ |
| M0        | Repository foundation, shared types, events, diagnostics, determinism, CI | ✅     | `packages/shared`, `packages/events`; ADR-0001/0002          |
| M1        | Minimal VM (registers, memory, decoder, MOV/ADD/PRINT/HALT)               | ✅     | `packages/cpu`, `packages/memory`                            |
| M2        | Kernel boot, processes, FIFO/RR scheduler, syscalls, timer                | ✅     | `packages/kernel`, `packages/scheduler`; ADR-0003            |
| M3        | VFS, shell parser/builtins, terminal runtime                              | ✅     | `packages/filesystem`, `packages/shell`, `packages/terminal` |
| M4        | NovaASM assembler + program runner; `compile`/`run`                       | ✅     | `packages/assembler`, `packages/simulator`                   |
| M5        | Toy C compiler + ISA extension                                            | ✅     | `packages/compiler`; ADR-0004; PR #3                         |
| M6        | Debugger, breakpoints, watches, timeline, replay                          | ✅     | `packages/debugger`; PR #4                                   |
| M7        | Workspace UI (Vite React SPA)                                             | ✅     | `apps/web`; ADR-0005; PR #5                                  |
| M8        | Orchestration framework (this directory)                                  | ✅     | `docs/orchestration`                                         |
| M9        | Testing & DevOps hardening                                                | ✅     | integration/golden/replay suites + CI gates; PR #7           |
| M10       | Public v1.0 launch (README, release, deploy)                              | ✅     | examples, README, v1.0.0 release, live Pages deploy; PR #8   |

## 50-agent roster → delivered work

The roster from spec §11 maps to concrete packages/artifacts. Reviewer column
omitted (the integration lead reviews all).

### Group A - Leadership & Architecture

| #   | Agent                   | Realized as                                      | Status          |
| --- | ----------------------- | ------------------------------------------------ | --------------- |
| 01  | Program Manager         | this registry + milestone checkpoints            | ✅              |
| 02  | Staff Architect         | `docs/adr/*`, `scripts/check-architecture.ts`    | ✅              |
| 03  | API Contract Architect  | `@novaos/shared` types, event/snapshot contracts | ✅              |
| 04  | Monorepo Infrastructure | pnpm workspace, turbo, tsconfig, tsup            | ✅              |
| 05  | Documentation Lead      | `docs/**`, package READMEs                       | 🟡 (M10 polish) |

### Group B - Shared Runtime Foundation

| 06 Shared Types | `packages/shared/src/{ids,result,span,...}` | ✅ |
| 07 Event Bus | `packages/events` | ✅ |
| 08 Determinism | `packages/shared/src/{clock,random}` | ✅ |
| 09 Errors/Diagnostics | `packages/shared/src/diagnostics` | ✅ |
| 10 Serialization/Snapshot | `packages/shared/src/serialization`, snapshots | ✅ |

### Group C - CPU & VM

| 11 CPU Registers | `packages/cpu/src/register-file.ts` | ✅ |
| 12 Decoder | `packages/cpu/src/decoder.ts` | ✅ |
| 13 Instruction Handlers | `packages/cpu/src/handlers.ts` (30 opcodes) | ✅ |
| 14 VM Pipeline | `packages/cpu/src/cpu.ts` | ✅ |
| 15 VM Exceptions | `packages/cpu/src/faults.ts` | ✅ |

### Group D - Memory, Kernel, Scheduling

| 16 Memory Core | `packages/memory` | ✅ |
| 17 Allocator | first-fit allocator in `packages/memory` | ✅ |
| 18 Stack/Heap | stack via SP/BP + PUSH/POP/CALL/RET (ADR-0004) | ✅ |
| 19 Kernel Core | `packages/kernel` | ✅ |
| 20 Process Manager | PCB lifecycle in `packages/kernel` | ✅ |
| 21 Scheduler | `packages/scheduler` (FIFO, Round Robin) | 🟡 (priority/SJF/lottery future) |
| 22 Syscalls | print/exit (more syscalls future) | 🟡 |
| 23 Interrupts | timer interrupt + context switch | 🟡 |

### Group E - Filesystem, Shell, Terminal

| 24 Filesystem Core | `packages/filesystem` (inode tree, path resolver) | ✅ |
| 25 File Operations | create/read/write/copy/move/delete | ✅ |
| 26 Persistence | in-memory snapshot/restore (IndexedDB future) | 🟡 |
| 27 Shell Parser | `packages/shell` lexer/parser | ✅ |
| 28 Shell Builtins | 21 builtins incl. compile/run | ✅ |
| 29 Terminal Runtime | `packages/terminal` | ✅ |

### Group F - Compiler, Assembler, Debugger

| 30 Toy C Lexer/Parser | `packages/compiler/src/{lexer,parser,ast}.ts` | ✅ |
| 31 Semantic Analysis | `packages/compiler/src/semantics.ts` | ✅ |
| 32 IR | `packages/compiler/src/ir.ts` | ✅ |
| 33 Optimizer | const-fold, copy-prop, DCE (toggleable) | ✅ |
| 34 Assembly Generation | `packages/compiler/src/codegen.ts` | ✅ |
| 35 Assembler | `packages/assembler` | ✅ |
| 36 Source Maps | `packages/compiler/src/source-map.ts` | ✅ |
| 37 Debugger Core | `packages/debugger/src/controller.ts` | ✅ |
| 38 Breakpoints/Watches | 5 breakpoint kinds + safe watch evaluator | ✅ |
| 39 Timeline/Replay | timeline summary + deterministic time-travel | ✅ |

### Group G - UI & UX

| 40 Design System | `apps/web/src/styles.css` (tokens) | 🟡 (`packages/ui` future) |
| 41 Workspace Layout | `apps/web/src/App.tsx` | ✅ |
| 42 Editor | textarea (Monaco is an ADR-0005 follow-up) | 🟡 |
| 43 Terminal UI | output panel | 🟡 (full terminal UI future) |
| 44 Memory Visualization | (future) | ⬜ |
| 45 CPU/Process UI | register + call-stack panels | 🟡 |
| 46 Debugger UI | `apps/web/src/components/DebuggerPanel.tsx` | ✅ |
| 47 Tutorials/Examples | (M10) | ⬜ |

### Group H - Quality, Performance, Release

| 48 Testing & QA | Vitest + Playwright + integration/golden/replay suites, `scripts/check-architecture.ts` | ✅ |
| 49 Performance/A11y | (property/fuzz, a11y audit, perf budgets) | ⬜ (post-v1.0) |
| 50 Release/Demo | README, release notes, v1.0.0 release, Pages deploy | ✅ |

## Open follow-ups (tracked, not blocking)

- Additional syscalls (read/open/close/sleep/malloc/free/yield/time) and richer
  scheduler algorithms (priority, SJF, lottery).
- Browser persistence (IndexedDB) for the filesystem.
- Monaco editor, memory hex grid, full terminal UI, tutorials.
- These are intentionally deferred; the architecture (events, snapshots,
  contracts) already accommodates them without rewrites.
