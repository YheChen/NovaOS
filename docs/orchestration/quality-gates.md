# Quality Gates & Risk Register

## Merge gates

Every change to `main` passes these. The aggregate command is `pnpm validate`.

| #   | Gate         | Command                 | Bar                                                        |
| --- | ------------ | ----------------------- | ---------------------------------------------------------- |
| 1   | Format       | `pnpm format:check`     | Prettier-clean                                             |
| 2   | Lint         | `pnpm lint`             | Zero ESLint errors                                         |
| 3   | Typecheck    | `pnpm typecheck`        | Zero TS errors (root `tsc`, strict)                        |
| 4   | Unit tests   | `pnpm test`             | All green (Vitest)                                         |
| 5   | Build        | `pnpm build`            | All packages build (Turborepo)                             |
| 6   | Architecture | `pnpm check:arch`       | No boundary/cycle/determinism/eval violations              |
| 7   | Integration  | `pnpm test:integration` | Green (currently `--passWithNoTests`; populated in M9)     |
| 8   | E2E          | `pnpm test:e2e`         | Flagship flow green (Playwright; runs in the E2E workflow) |

CI runs gates 1-6 on every pull request (`.github/workflows/ci.yml`) and the
E2E flow on push to `main` (`.github/workflows/e2e.yml`).

### Architecture check (Gate 6) enforces

1. No deep imports into another package's internals (only `@novaos/<pkg>`).
2. Every `@novaos/*` import is declared in the importer's `package.json`.
3. `@novaos/shared` depends on no other workspace package.
4. `@novaos/ui` imports no workspace package.
5. Domain packages import no UI libraries (react, monaco, …).
6. Deterministic packages contain no `Math.random()` / `Date.now()`.
7. No `eval(` / `new Function(` anywhere.
8. The inter-package dependency graph is acyclic.

### Determinism (Gate, applied to runtime changes)

- Same seed + inputs → same event sequence (verified by replay/equivalence
  tests, e.g. the debugger's "deterministic across two sessions" test).
- Injected `SimulationClock` and seeded `DeterministicRandom`; never wall-clock.

## Risk register

Risks carried from spec §19 plus the concrete ones encountered during the build.

| Risk                                                         | Mitigation                                                                                                                                                                                | Status        |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Runtime/UI coupling                                          | Arch check rule 5; UI consumes snapshots/events only                                                                                                                                      | Controlled    |
| UI built on fake data                                        | `apps/web` calls real `compileToyC`/`createDebugger`; e2e runs real flow                                                                                                                  | Controlled    |
| Non-deterministic behavior                                   | Seeded PRNG + injected clock; arch check bans `Math.random`/`Date.now`; replay tests                                                                                                      | Controlled    |
| Circular dependencies                                        | Scheduler operates on `SchedulableProcess` not PCB; shell uses injected `SystemInspector`/`ProgramRunner`; simulator's runner is structurally (not nominally) compatible with the shell's | Controlled    |
| Silent contract drift                                        | Public API/event/snapshot changes recorded in milestone checkpoints + ADRs                                                                                                                | Controlled    |
| Integer literal range (Toy C)                                | Limited to 0-65535 (16-bit `LDI`); documented in ADR-0004                                                                                                                                 | Accepted (V1) |
| Logical operators evaluate both sides (Toy C)                | The `and`/`or` operators are non-short-circuit; operands have no side effects in practice; documented in ADR-0004                                                                         | Accepted (V1) |
| Time-travel replay cost                                      | Replay-from-start is O(n); fine for demo programs; snapshot-interval optimization is a future enhancement                                                                                 | Accepted (V1) |
| Tooling gremlins (NUL-byte regex, BSD grep, Prettier reflow) | Diagnosed and documented in `handover.json` deviations; `pnpm format` before `format:check`                                                                                               | Resolved      |
| CI infra drift (pnpm version pin, Node 20 EOL)               | Fixed in PR #2; action majors on Node 24, pnpm read from `packageManager`                                                                                                                 | Resolved      |

## Definition of done (orchestration)

The build is coherent when: milestones complete incrementally; `main` stays
buildable; public contracts stay stable; runtime packages remain UI-free; the UI
consumes real contracts; core behavior is tested; replay is deterministic; docs
stay current. All hold as of M8.
