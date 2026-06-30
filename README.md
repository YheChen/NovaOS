# NovaOS

> A browser-based interactive operating systems laboratory.

NovaOS makes the invisible parts of an operating system **visible**. Write a small
program, compile it, run it inside a simulated machine, and watch CPU registers
mutate, memory change, processes get scheduled, syscalls cross into the kernel,
and execution replay backwards through a deterministic timeline.

It is built like a serious systems project: a deterministic simulation engine in
pure TypeScript with a premium DevTools-style UI layered on top. The simulator core
owns truth; the UI only observes serializable snapshots and typed events.

---

## Status

🚧 **Milestone 0 — Repository Foundation.** The monorepo, shared primitives, typed
event bus, deterministic utilities, testing harness, architecture checks, and CI
skeleton are in place. The virtual machine, kernel, filesystem, compiler, debugger,
and UI arrive in later milestones (see the roadmap).

## Quickstart

```bash
pnpm install      # install workspace dependencies
pnpm validate     # format check + lint + typecheck + tests + build + architecture check
```

Individual gates:

```bash
pnpm typecheck    # strict TypeScript, whole-repo
pnpm lint         # ESLint (flat config), zero warnings
pnpm test         # Vitest unit tests
pnpm build        # Turborepo + tsup per-package build
pnpm check:arch   # package-boundary / determinism / cycle checks
pnpm test:e2e     # Playwright skeleton (no web app yet)
```

## Architecture at a glance

```
Presentation        apps/web (Next.js, later milestones)
Application         UI stores, runtime client (later)
Simulation Runtime  @novaos/simulator — boot, ticking, snapshots, replay
Domain              @novaos/{cpu, memory, kernel, scheduler, filesystem,
                    shell, terminal, assembler, compiler, debugger}
Shared              @novaos/shared (primitives), @novaos/events (event bus)
```

Dependency direction is strictly downward. Domain packages are **UI-free** (no React,
DOM, or Monaco). `@novaos/ui` is **domain-free**. Every package exports only through
`src/index.ts`. The package graph is acyclic and enforced by `pnpm check:arch`.

## Project structure

```
novaos/
  apps/web/              browser app shell (stub until Milestone 7)
  packages/
    shared/              branded types, Result, source spans, diagnostics,
                         deterministic clock + seeded PRNG, serialization
    events/              typed DomainEvent, EventBus, EventRecorder
    testing/             shared test fixtures & event assertions
    simulator/ cpu/ memory/ kernel/ scheduler/ filesystem/ shell/
    terminal/ assembler/ compiler/ debugger/ ui/ examples/   (scaffolds)
  docs/
    adr/                 architecture decision records
    specs/               the authoritative product/engineering specifications
  scripts/               check-architecture.ts and tooling
  tests/                 unit / integration / golden / replay / e2e harnesses
  .github/workflows/     CI
```

## Tech stack

TypeScript (strict) · pnpm workspaces · Turborepo · tsup · Vitest · Playwright ·
ESLint (flat) · Prettier · (later: Next.js, React, Tailwind, shadcn/ui, Monaco,
Zustand, Framer Motion).

## Documentation

- [`docs/specs/`](docs/specs) — the 10 authoritative specification documents
- [`docs/adr/`](docs/adr) — architecture decision records
- [`docs/contributing.md`](docs/contributing.md) — contributor guide

## License

TBD.
