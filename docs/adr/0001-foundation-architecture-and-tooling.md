# ADR-0001: Foundation architecture and tooling

## Status

Accepted (Milestone 0)

## Context

NovaOS is a large, multi-subsystem project intended to be built milestone by
milestone by a coordinated set of agents. Before any feature code is written we
need a repository foundation that enforces the architectural invariants from the
specifications: deterministic simulation core, strict package boundaries, UI/runtime
decoupling, and an always-green main branch.

## Decision

1. **Monorepo with pnpm workspaces** (`packages/*`, `apps/*`).
2. **Turborepo** as the task runner for per-package `build` (parallel, cached).
3. **TypeScript strict** with additional safety flags (`noUncheckedIndexedAccess`,
   `verbatimModuleSyntax`, `isolatedModules`, `noUnusedLocals/Parameters`). A single
   root `tsconfig.json` typechecks the whole repo in one pass.
4. **Module resolution `Bundler`**; workspace packages resolve via pnpm symlinks and
   each package's `"types": "./src/index.ts"`. No tsconfig path aliases are needed.
5. **tsup** (esbuild) for per-package builds, JS output only for now (declaration
   emission is deferred until an external consumer needs it).
6. **Vitest** for unit/integration/golden/replay tests (centralized root config),
   **Playwright** for E2E (skeleton until the web app exists).
7. **ESLint flat config** + **Prettier** + **eslint-config-prettier**.
8. **Architecture boundary checks** implemented as `scripts/check-architecture.ts`
   (run via `tsx`) rather than relying solely on lint plugins, so boundary,
   determinism, and cycle rules are enforced uniformly and in CI.
9. **Event-driven, deterministic core**: domain packages emit typed events, own
   serializable snapshots, and never use wall-clock time or unseeded randomness.

## Consequences

- The structural invariants are machine-checked from day one (`pnpm check:arch`).
- A single root `tsc` keeps cross-package typechecking simple and avoids the friction
  of TypeScript project references / composite builds; per-milestone incremental builds
  can be revisited if typecheck time grows.
- JS-only builds keep the foundation robust; `.d.ts` generation is a later concern.

## Alternatives Considered

- **Nx** instead of Turborepo: heavier, more opinionated than needed for v1.
- **TypeScript project references / composite**: more "correct" for incremental builds
  but adds real configuration friction; deferred.
- **Lint-only boundary enforcement** (eslint-plugin-import / dependency-cruiser): useful,
  but a small custom script gives precise control over NovaOS-specific rules (determinism,
  `@novaos/*` deep-import bans, declared-dependency checks) in one place.
