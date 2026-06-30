# Contributing to NovaOS

## Golden rules

1. **`main` always builds.** Every change must pass `pnpm validate`.
2. **One owner per file.** Coordinate before editing a file another stream owns.
3. **Contracts before implementation.** Public interfaces are defined before parallel work.
4. **The simulator core owns truth; the UI only observes** snapshots and typed events.
5. **Determinism is a feature.** No `Date.now()` / `Math.random()` in domain logic — use the
   injected `SimulationClock` and seeded `DeterministicRandom` from `@novaos/shared`.
6. **No untested core logic, no untyped public APIs, no silent contract changes.**

## Package boundaries

- Every package exposes its public API only through `src/index.ts`.
- Never import another package's internals (`@novaos/x/src/...`). Import the root: `@novaos/x`.
- Domain packages must not import React, the DOM, Monaco, Zustand, or other UI libraries.
- `@novaos/ui` must not import any workspace (domain) package.
- `@novaos/shared` depends on no other workspace package.
- The package graph must stay acyclic.

All of the above are enforced by `pnpm check:arch`.

## Quality gates

Run before opening a PR:

```bash
pnpm validate   # format:check + lint + typecheck + test + build + check:arch
```

- Add tests next to the code you change (`*.test.ts`).
- Add an ADR under `docs/adr/` for any architecture-affecting decision.
- Update the relevant package `README.md` when public API, events, or snapshots change.

## Commits & branches

- Branch name: `agent/<id>/<task-slug>` or `feature/<slug>`.
- Keep changes small and tested; prefer many small merges over one large one.
