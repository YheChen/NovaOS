# NovaOS Orchestration

This directory is the **living project-management surface** for NovaOS - the
concrete realization of the 50-agent orchestration plan in
[`docs/specs/08-agent-orchestration-v2.md`](../specs/08-agent-orchestration-v2.md).

NovaOS was built milestone-by-milestone by a single Claude Code instance acting
as program manager, staff engineer, architect, integration lead, and release
manager. The spec describes an organization of up to 50 specialized agents; this
repo applies the same **discipline** - contracts first, clear ownership, one
owner per file, continuous integration, no merge without green gates - whether
the work is executed by 50 agents or one.

## Documents

- [`task-registry.md`](./task-registry.md) - the 50-agent roster mapped to real
  packages and current status, plus the milestone status dashboard.
- [`quality-gates.md`](./quality-gates.md) - the merge gates, the exact commands,
  and the risk register (including real risks encountered during the build).

## Operating model (as applied)

```
spec  ->  contracts (types/events/snapshots)  ->  implementation  ->  tests  ->  gates  ->  PR  ->  CI  ->  squash-merge to main
```

Every milestone followed this loop:

1. Read the relevant spec section.
2. Establish/extend the public contracts (branded types, events, snapshots).
3. Implement behind those contracts, one package at a time.
4. Write unit/integration/golden/replay tests as appropriate.
5. Run all quality gates locally (`pnpm validate`).
6. Open a PR; wait for CI to go green.
7. Squash-merge to `main`; `main` is always buildable.
8. Record a milestone checkpoint and any ADRs.

## Rules enforced on every change

- **One owner per file.** No two workstreams edit the same file uncoordinated.
- **Contracts before implementation.** Public interfaces are settled before
  dependents build on them (e.g., the `ProgramRunner` interface is shared
  structurally so the shell never imports the simulator).
- **No UI in domain packages / no domain truth in the UI.** Enforced by
  `scripts/check-architecture.ts` (rule 5) and verified on every commit.
- **No silent contract changes.** Public API/event/snapshot changes are called
  out in the milestone checkpoint and, when architectural, an ADR.
- **Determinism.** No `Math.random()` / `Date.now()` in deterministic packages
  (enforced by the arch check); seeded PRNG + injected clock everywhere.
- **No merge without green gates.** Format, lint, typecheck, tests, build, and
  the architecture check must all pass.

## Activation waves (spec §12) vs. delivered milestones

The spec's eight activation waves map onto the delivered milestones M0-M10:

| Wave                       | Spec focus                                         | Delivered in |
| -------------------------- | -------------------------------------------------- | ------------ |
| 1 Foundation               | shared types, events, diagnostics, determinism, CI | M0           |
| 2 VM & Memory              | registers, decoder, handlers, pipeline, memory     | M1           |
| 3 Kernel & Scheduling      | boot, processes, scheduler, syscalls, interrupts   | M2           |
| 4 Filesystem & Shell       | VFS, shell, terminal                               | M3           |
| 5 Toolchain                | assembler (M4), Toy C compiler (M5)                | M4-M5        |
| 6 Debugger & Replay        | debugger, breakpoints, watches, timeline, replay   | M6           |
| 7 UI Integration           | workspace, editor, inspector, debugger panels      | M7           |
| 8 Education, Perf, Release | orchestration docs, testing/devops, launch         | M8-M10       |
