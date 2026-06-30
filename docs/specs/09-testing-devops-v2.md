# NovaOS
# 09 - Testing, DevOps, Security & Performance Specification

Version: 2.0

Status: Implementation Specification

Depends On:
- 01-product-requirements.md
- 02-system-architecture.md
- 03-virtual-machine.md
- 04-kernel-memory-processes-v2.md
- 05-filesystem-shell-v2.md
- 06-compiler-debugger-v2.md
- 07-ui-design-system-v2.md
- 08-agent-orchestration-v2.md

Primary Packages / Areas:
- `tests/`
- `.github/workflows/`
- `scripts/`
- `packages/shared`
- `packages/simulator`
- `packages/cpu`
- `packages/memory`
- `packages/kernel`
- `packages/filesystem`
- `packages/compiler`
- `packages/assembler`
- `packages/debugger`
- `packages/ui`
- `apps/web`

---

# 1. Purpose

This document defines the engineering quality system for NovaOS.

NovaOS is an educational operating systems laboratory, but the repository should be engineered like a serious production project. The quality system must prove that the simulator is deterministic, the compiler is stable, the debugger is trustworthy, the UI is accessible, and the app remains performant as features grow.

Testing and DevOps are not afterthoughts.

They are part of the product.

A user should trust NovaOS because:

- the virtual machine produces deterministic execution
- kernel state transitions are validated
- memory safety checks are tested
- compiler output is golden-tested
- debugger stepping is reproducible
- filesystem operations are snapshot-tested
- UI workflows are covered by E2E tests
- accessibility is continuously checked
- performance budgets are enforced
- releases are repeatable

The repository should make this obvious to a recruiter, professor, open-source maintainer, or systems engineer.

---

# 2. Quality Philosophy

NovaOS follows eight quality principles.

## 2.1 Determinism is a feature

The same program, same filesystem, same inputs, same scheduler configuration, and same seed must produce the same output and event sequence.

Determinism must be tested directly.

## 2.2 Every subsystem owns its tests

No package is "done" until its tests are done.

Agents are not allowed to defer testing to a later QA phase.

## 2.3 Golden tests protect educational artifacts

Compiler output, assembler output, source maps, diagnostics, and event traces should be golden-tested because users learn from these artifacts.

Changing them should require deliberate review.

## 2.4 UI tests must cover real workflows

NovaOS is a tool. The most important tests are not just component snapshots; they are user journeys:

- boot
- edit
- compile
- run
- debug
- inspect memory
- rewind timeline

## 2.5 Accessibility is a release blocker

A visual operating system laboratory must still be usable through keyboard navigation, screen readers, high contrast, and reduced motion.

Accessibility failures are product failures.

## 2.6 Performance budgets prevent slow decay

The app must remain responsive while simulating complex systems.

Performance should be measured early, not only after the UI becomes slow.

## 2.7 Security matters even in a simulator

NovaOS accepts user code, filesystem imports, traces, and snapshots. It must not execute untrusted user input as host JavaScript.

## 2.8 Main must stay green

The main branch should always be buildable, testable, and demoable.

---

# 3. Tooling Stack

Recommended tooling:

```text
Package manager: pnpm
Language: TypeScript
App framework: Next.js
Unit testing: Vitest
Component testing: React Testing Library
E2E testing: Playwright
Linting: ESLint
Formatting: Prettier
Type checking: TypeScript project references
Git hooks: Husky or lefthook
CI: GitHub Actions
Deployment: Vercel or equivalent static/Next deployment
Coverage: Vitest coverage provider
Accessibility: Playwright + axe where useful
Bundle analysis: Next bundle analyzer or equivalent
```

Avoid tool sprawl.

Only add additional tools when they solve a clear problem.

---

# 4. Required Repository Scripts

The root `package.json` should expose predictable commands.

```json
{
  "scripts": {
    "dev": "pnpm --filter @novaos/web dev",
    "build": "turbo build",
    "typecheck": "turbo typecheck",
    "lint": "turbo lint",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "turbo test",
    "test:unit": "turbo test:unit",
    "test:integration": "turbo test:integration",
    "test:e2e": "playwright test",
    "test:coverage": "turbo test:coverage",
    "test:replay": "turbo test:replay",
    "test:golden": "turbo test:golden",
    "test:a11y": "playwright test --grep @a11y",
    "perf": "pnpm run perf:local",
    "validate": "pnpm typecheck && pnpm lint && pnpm test && pnpm build"
  }
}
```

Package-level scripts should be consistent.

Example:

```json
{
  "scripts": {
    "build": "tsup src/index.ts",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --max-warnings=0",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

---

# 5. Test Pyramid

NovaOS uses a layered testing model.

```text
                  E2E Tests
              Critical user flows
           ───────────────────────
              Integration Tests
       Package boundaries and workflows
     ───────────────────────────────────
              Golden Tests
 Compiler, assembler, source maps, traces
 ───────────────────────────────────────
              Unit Tests
 Pure domain logic and components
```

Approximate distribution:

```text
Unit tests: 60%
Integration tests: 20%
Golden tests: 10%
E2E tests: 10%
```

The exact percentages are less important than covering risk.

High-risk areas:

- VM execution
- memory safety
- kernel state transitions
- scheduler determinism
- compiler lowering
- assembler encoding
- debugger stepping
- filesystem persistence
- UI event integration

---

# 6. Coverage Targets

Coverage targets should be meaningful, not vanity metrics.

Minimum targets:

| Area | Line Coverage | Branch Coverage | Notes |
|---|---:|---:|---|
| `packages/shared` | 95% | 90% | Small primitives should be heavily tested |
| `packages/cpu` | 95% | 90% | Every instruction edge case |
| `packages/memory` | 95% | 90% | Safety-critical |
| `packages/kernel` | 90% | 85% | State machines and faults |
| `packages/scheduler` | 95% | 90% | Shared behavior suite |
| `packages/filesystem` | 90% | 85% | Path and persistence edge cases |
| `packages/shell` | 90% | 85% | Parsing and commands |
| `packages/compiler` | 90% | 85% | Golden tests also required |
| `packages/assembler` | 95% | 90% | Encoding correctness |
| `packages/debugger` | 90% | 85% | Stepping and replay |
| `packages/ui` | 80% | 70% | Focus on behavior, not snapshots |
| `apps/web` | 70% | 60% | E2E covers app behavior |

Do not block early milestones on final coverage targets, but quality should improve milestone by milestone.

By public release, core runtime and toolchain packages should meet their targets.

---

# 7. Unit Testing Standards

Unit tests must be:

- deterministic
- fast
- isolated
- clear
- focused on behavior
- written close to the package they test

Test file naming:

```text
*.test.ts
*.test.tsx
```

Recommended structure:

```text
packages/cpu/
  src/
    register-file.ts
    instruction-decoder.ts
  tests/
    register-file.test.ts
    instruction-decoder.test.ts
```

Unit test format:

```ts
describe("RegisterFile", () => {
  it("updates FLAGS when arithmetic result is zero", () => {
    // arrange
    // act
    // assert
  });
});
```

Avoid vague test names.

Bad:

```text
works
```

Good:

```text
marks the zero flag when ADD produces 0
```

---

# 8. Shared Test Utilities

Create shared test utilities in:

```text
tests/utils/
```

or package-specific utilities in:

```text
packages/<package>/tests/utils/
```

Shared utilities may include:

- deterministic seed helper
- fake event bus
- memory fixture builder
- process fixture builder
- bytecode fixture builder
- filesystem fixture builder
- compiler fixture builder
- timeline assertion helper
- event sequence matcher
- diagnostic matcher

Example:

```ts
expectEvents(events).toEqualSequence([
  "KernelBootStarted",
  "KernelBootCompleted",
  "ProcessCreated",
  "InstructionExecuted",
  "ProcessTerminated"
]);
```

Do not overgeneralize test utilities too early.

---

# 9. Deterministic Replay Tests

Replay tests are central to NovaOS.

A replay test verifies:

1. Start from initial snapshot.
2. Execute deterministic input sequence.
3. Record events and final snapshot.
4. Reset runtime.
5. Replay from same initial snapshot.
6. Compare event sequence and final snapshot.

Replay test contract:

```ts
export interface ReplayTestCase {
  name: string;
  initialSnapshot: RuntimeSnapshot;
  inputs: SimulatedInput[];
  expectedEvents?: string[];
  expectedFinalState?: PartialRuntimeExpectation;
}
```

Required replay test scenarios:

- simple arithmetic program
- program with branch
- program with loop
- program with syscall print
- program with malloc/free
- timer interrupt and Round Robin scheduling
- filesystem command sequence
- debugger stepping sequence
- memory fault
- process termination

Replay comparison should normalize non-semantic IDs only if those IDs are intentionally nondeterministic. Prefer deterministic IDs.

---

# 10. Golden Tests

Golden tests compare stable output artifacts against approved expected files.

Golden test directories:

```text
tests/golden/
  compiler/
  assembler/
  diagnostics/
  source-maps/
  event-traces/
  filesystem-snapshots/
```

Golden artifacts:

- tokens
- AST
- IR
- optimized IR
- assembly
- bytecode
- diagnostics
- source maps
- runtime event traces
- filesystem snapshots
- debugger timelines

Golden update command:

```bash
pnpm test:golden --update
```

Golden update rules:

- never update golden files blindly
- require reviewer approval
- include explanation in PR
- mention whether change is expected or regression
- keep golden files readable where possible

Prefer JSON with stable key ordering for golden artifacts.

---

# 11. Property and Fuzz Testing

Property-style tests are useful for state machines and parsers.

Recommended areas:

## Allocator

Properties:

- allocated blocks do not overlap
- free blocks do not overlap
- total free + allocated equals total managed memory
- freeing then reallocating preserves invariants
- adjacent free blocks merge

## Path resolver

Properties:

- canonical paths never contain `..`
- resolving above root fails or clamps consistently
- repeated slashes normalize deterministically

## Scheduler

Properties:

- terminated processes are never selected
- blocked processes are never selected
- same seed gives same decisions
- ready process is eventually selected under fair schedulers

## Parser

Properties:

- parser does not throw host exceptions on arbitrary input
- diagnostics are returned for malformed input
- source spans remain within file bounds

Use fuzzing carefully. It should not make CI flaky.

Keep expensive fuzz tests in nightly or manual workflows.

---

# 12. Integration Testing

Integration tests verify package boundaries and multi-package workflows.

Integration test location:

```text
tests/integration/
```

Required integration flows:

## VM + Memory

- instruction reads/writes memory through memory API
- invalid memory access produces memory fault
- instruction execution emits events

## CPU + Kernel

- process register snapshot saves and restores
- `HALT` terminates process
- `SYSCALL` routes to kernel

## Kernel + Scheduler

- timer interrupt triggers scheduling
- terminated process removed from scheduler
- blocked process not scheduled

## Kernel + Memory

- process creation allocates memory segments
- termination frees memory
- segmentation fault only faults offending process

## Filesystem + Shell

- `mkdir`, `touch`, `cat`, `rm` operate on real VFS
- shell cwd updates path resolution
- filesystem events emit

## Compiler + Assembler + VM

- Toy C compiles to assembly
- assembly encodes to bytecode
- bytecode executes correctly

## Debugger + VM + Source Maps

- line breakpoint resolves to instruction address
- step source line advances correctly
- watch expression updates after pause

## UI + Runtime Contracts

- UI components render real snapshots
- no UI test depends on fake contract shape that differs from runtime

---

# 13. E2E Testing

Use Playwright for browser-level E2E tests.

E2E tests should prioritize user workflows, not implementation details.

Required smoke test:

```text
1. Open app.
2. Boot NovaOS.
3. Open example file.
4. Compile file.
5. Run file.
6. Verify terminal output.
7. Start debug session.
8. Step once.
9. Verify register changed.
10. Open memory view.
11. Verify memory cell inspector opens.
12. Open timeline.
13. Verify events exist.
```

Additional E2E flows:

- command palette run command
- file explorer create/rename/delete file
- terminal history and autocomplete
- compile error shows diagnostic
- assembler error shows diagnostic
- breakpoint pauses execution
- timeline rewind changes displayed state
- switch scheduler visualization
- reset filesystem confirmation
- high contrast mode
- reduced motion mode

Tag E2E tests:

```text
@smoke
@debugger
@compiler
@filesystem
@a11y
@performance
```

---

# 14. Accessibility Testing

Accessibility testing combines automated checks and manual keyboard review.

Automated checks:

- obvious contrast issues
- missing labels
- invalid ARIA
- focusable controls
- dialog focus trap
- form labels

Manual checks:

- keyboard-only boot/edit/compile/run/debug flow
- command palette navigation
- file explorer tree navigation
- terminal keyboard behavior
- memory grid selection
- timeline navigation
- reduced motion mode
- screen reader summaries for visualizations

Accessibility release blockers:

- invisible focus
- keyboard trap
- unlabeled critical controls
- command palette unusable by keyboard
- terminal unusable by keyboard
- debugger controls inaccessible
- color-only state indication
- reduced motion ignored for major animations

Accessibility checklist for visualizations:

```text
- Is there a text summary?
- Can keyboard users select items?
- Does selection update inspector?
- Is color backed by label/icon/shape?
- Does screen reader output avoid overwhelming users?
- Are high-frequency updates announced politely or not at all?
```

---

# 15. Performance Testing

Performance tests protect core interactions.

Performance budgets:

| Area | Budget |
|---|---:|
| Initial app shell render | < 2s normal laptop |
| Kernel boot | < 500ms in normal mode |
| Process creation | < 5ms |
| Context switch | < 1ms headless |
| Instruction step visual path | < 16ms target |
| Memory read/write | O(1) |
| Compile normal demo | < 250ms |
| Assemble normal demo | < 50ms |
| Command palette search | < 100ms |
| Terminal simple command | < 50ms |
| Timeline with 10,000 events | usable |
| Memory grid scroll | 60 FPS target |

Performance scenarios:

- run 100,000 instructions headless
- render memory grid for 64 KiB
- render memory grid for 1 MiB optional mode
- timeline with 10,000 events
- process table with 100 processes
- compile 1,000-line Toy C file
- terminal with 10,000 output chunks
- replay from snapshot with 10,000 events

Use budgets as guardrails, not absolute early-development blockers. Before public release, critical paths should meet budgets.

---

# 16. Performance Engineering Guidelines

Runtime:

- keep memory reads/writes O(1)
- avoid copying full RAM on every step
- use delta events for memory changes
- snapshot periodically, not every instruction
- batch high-frequency events
- use seeded PRNG efficiently
- avoid class-heavy object churn in hot loops if problematic

UI:

- virtualize memory grid
- virtualize timeline
- virtualize terminal output
- use selectors for state subscriptions
- avoid workspace-wide re-render on every event
- throttle visualization in fast-run mode
- show sampled updates at high speed
- keep detailed tracing configurable
- lazy-load heavy panels
- move compilation/replay to workers if needed

Compiler:

- preserve deterministic output
- avoid repeated full-tree traversal where unnecessary
- cache source spans carefully
- keep diagnostics stable

Debugger:

- O(1) breakpoint lookup by address
- efficient line-to-address mapping
- bounded watch evaluation
- snapshot interval configurable

---

# 17. Security Model

NovaOS is browser-based and simulated. It must not execute user programs on the host system.

Security rules:

- never use `eval` for Toy C, assembly, shell, or watch expressions
- never generate JavaScript and execute it for user programs
- never trust imported filesystem snapshots
- never trust imported traces
- validate bytecode before loading
- cap file sizes
- cap instruction execution
- cap timeline growth
- cap terminal output
- sanitize user-rendered text
- avoid dangerously setting HTML
- protect against runaway loops
- provide emergency stop/pause
- avoid leaking data through exported traces unintentionally

User code executes only inside the NovaOS VM.

Shell commands operate only on the virtual filesystem.

Filesystem paths must never access host filesystem paths.

---

# 18. Input Validation

Validate all external inputs:

- uploaded filesystem JSON
- uploaded trace JSON
- pasted source files
- imported bytecode
- URL parameters / deep links
- tutorial definitions
- plugin definitions when plugins exist
- saved local storage / IndexedDB data
- command palette parameters

Use schema validation where useful.

Invalid imports should produce diagnostics, not crashes.

Example:

```text
Could not import filesystem snapshot.
Reason: snapshot version 4 is newer than this NovaOS build supports.
```

---

# 19. Dependency Security

Dependency rules:

- prefer well-known, maintained packages
- avoid packages with broad transitive trees
- pin major versions deliberately
- review dependency licenses
- run dependency audit in CI
- avoid dependencies for trivial utilities
- document why major dependencies exist

Major allowed dependencies may include:

- Next.js
- React
- Monaco Editor
- Zustand
- TanStack Query if truly needed
- Framer Motion if motion is not overused
- Playwright
- Vitest

Question dependencies for:

- shell parsing
- compiler parsing
- emulator logic
- state machines

Those are core educational code and should generally be implemented in the repository.

---

# 20. Content Security Policy

For deployment, define a strict Content Security Policy where practical.

Goals:

- disallow inline scripts if feasible
- restrict script sources
- restrict object/embed sources
- restrict frame ancestors
- restrict connect sources to required services only
- protect against accidental HTML injection

Because Next.js and Monaco may require specific CSP allowances, document any exceptions.

CSP should be revisited before public release.

---

# 21. CI Pipeline

Use GitHub Actions.

Required workflows:

```text
ci.yml
e2e.yml
nightly.yml
release.yml
```

## `ci.yml`

Runs on:

- pull request
- push to main

Jobs:

1. install
2. format check
3. lint
4. typecheck
5. unit tests
6. integration tests
7. build
8. architecture check

## `e2e.yml`

Runs on:

- pull request for app/runtime changes
- push to main
- manual dispatch

Jobs:

1. build app
2. install Playwright
3. run smoke tests
4. upload traces/screenshots on failure

## `nightly.yml`

Runs on schedule or manual dispatch.

Jobs:

1. full test suite
2. fuzz/property tests
3. performance tests
4. accessibility sweep
5. dependency audit
6. bundle analysis

## `release.yml`

Runs on tag or manual release.

Jobs:

1. validate
2. build
3. run smoke E2E
4. package artifacts
5. deploy
6. create release notes

---

# 22. CI Caching

Use caching for:

- pnpm store
- Playwright browsers if appropriate
- build cache
- Turbo cache if configured safely

Do not let caching hide correctness issues.

CI should be reproducible from a clean checkout.

---

# 23. Architecture Checks

Add scripts to enforce architecture boundaries.

Checks:

- no package imports another package's `src/internal`
- no UI imports in domain packages
- no React imports in core packages
- no circular dependencies
- no forbidden browser APIs in deterministic packages
- no `Date.now()` in deterministic runtime logic
- no `Math.random()` in scheduler/kernel/simulator logic
- no `eval`
- no `dangerouslySetInnerHTML` except approved cases

Example script:

```text
scripts/check-architecture.ts
```

Architecture violations should fail CI.

---

# 24. Static Analysis

Static checks:

- TypeScript strict mode
- ESLint
- import boundaries
- unused exports
- dead code detection if configured
- dependency duplication
- bundle size analysis
- circular dependency detection

Potential tools:

- ESLint import rules
- dependency-cruiser
- knip
- ts-prune equivalent
- custom scripts

Use only what provides clear value.

---

# 25. Release Engineering

Release types:

- internal milestone release
- alpha
- beta
- public v1.0

Versioning:

```text
0.1.0 - minimal VM
0.2.0 - kernel boot
0.3.0 - filesystem/shell
0.4.0 - assembler/program runner
0.5.0 - Toy C compiler
0.6.0 - debugger/timeline
0.7.0 - full UI workspace
0.8.0 - tutorials/examples
1.0.0 - public polished release
```

Use semantic versioning after public release.

Release checklist:

```text
- build passes
- typecheck passes
- lint passes
- unit tests pass
- integration tests pass
- E2E smoke passes
- accessibility smoke passes
- performance smoke reviewed
- docs updated
- examples work
- screenshots updated
- README updated
- release notes written
- deployment verified
```

---

# 26. Deployment Strategy

NovaOS should be deployable without a backend for Version 1.

Recommended:

- Vercel deployment for `apps/web`
- static assets bundled
- examples stored in repository
- filesystem persistence in browser
- no required server database
- no authentication for MVP

Deployment environments:

```text
local
preview
production
```

Preview deployments should run on PRs if available.

Production deployment should be manually approved or tag-triggered.

---

# 27. Environment Variables

Version 1 should require minimal environment variables.

Possible variables:

```text
NEXT_PUBLIC_APP_VERSION
NEXT_PUBLIC_BUILD_SHA
NEXT_PUBLIC_RELEASE_CHANNEL
```

Avoid secrets in the frontend.

If future backend/cloud sync exists, add a separate security design.

---

# 28. Observability

NovaOS does not need production user tracking for MVP, but it should have developer observability.

In-app developer tools:

- event log
- performance overlay
- snapshot inspector
- deterministic seed display
- build info
- feature flags
- runtime limits
- trace export

Optional privacy-conscious analytics may be added later, but should not be required.

Error reporting:

- for local/dev: console and in-app diagnostics
- for production: optional user-consented error reporting in future

Do not send user source code or filesystem contents to external services without explicit consent.

---

# 29. Feature Flags

Feature flags help ship safely.

Potential flags:

```ts
export interface FeatureFlags {
  toyCCompiler: boolean;
  timeTravelDebugger: boolean;
  memoryHeatmap: boolean;
  schedulerVisualization: boolean;
  tutorialOverlay: boolean;
  workerSimulation: boolean;
  advancedFilesystem: boolean;
}
```

Flags should be deterministic for tests.

Avoid creating a permanent mess of flags. Remove stale flags after features stabilize.

---

# 30. Runtime Limits

Runtime limits prevent browser lockups.

```ts
export interface RuntimeLimits {
  maxInstructionsPerRun: number;
  maxProcesses: number;
  maxMemoryBytes: number;
  maxTimelineEvents: number;
  maxSnapshots: number;
  maxFileSizeBytes: number;
  maxOpenFilesPerProcess: number;
  maxTerminalOutputChunks: number;
  maxCompileSourceBytes: number;
}
```

Default limits should be generous enough for demos but safe for browsers.

When limits are hit, show educational diagnostics.

Example:

```text
Execution paused after 1,000,000 instructions.
This usually means the program may contain an infinite loop.
You can continue, debug, or stop the process.
```

---

# 31. Data Management

Browser persistence:

- user files
- layout preferences
- theme
- examples copied into user home
- tutorial progress
- recent projects

Reset options:

- reset simulator state
- reset filesystem
- reset layout
- reset all local data
- restore default examples

Export options:

- filesystem snapshot
- execution trace
- program bundle
- bug report bundle

Bug report bundle should avoid private data by default and preview included files before export.

---

# 32. Documentation Quality Gates

Required docs:

- root README
- quickstart
- architecture overview
- package READMEs
- contributing guide
- testing guide
- user guide
- tutorial authoring guide
- troubleshooting
- glossary
- ADR index

Package README template:

```markdown
# Package Name

## Purpose

## Public API

## Events

## Snapshots

## Testing

## Examples

## Dependency Rules
```

Docs should be updated in the same PR as behavior changes.

---

# 33. Code Review Standards

Every PR should be reviewed for:

- correctness
- determinism
- architecture
- tests
- errors/diagnostics
- performance impact
- accessibility impact
- documentation
- maintainability

Reviewer questions:

```text
Does this package own this responsibility?
Does this change preserve deterministic replay?
Are events typed and serializable?
Are edge cases tested?
Could this create UI/runtime coupling?
Will a student understand the diagnostic?
Does this affect performance budgets?
```

---

# 34. Agent QA Responsibilities

From `08-agent-orchestration-v2.md`, Agent 48 owns testing and QA, but every agent owns tests for their own work.

Agent 48 responsibilities:

- maintain test harnesses
- review test quality
- track coverage
- create E2E smoke tests
- maintain CI workflows
- report failing gates
- prevent shallow tests from counting as done

Agent 49 responsibilities:

- performance audits
- accessibility audits
- UI responsiveness checks
- reduced motion checks
- high contrast checks
- memory grid/timeline profiling

Agent 50 responsibilities:

- release readiness
- README polish
- demo scripts
- deployment verification
- screenshots
- release notes

---

# 35. Minimum Required Tests by Milestone

## Milestone 0

- package scaffold builds
- typecheck passes
- sample unit test passes
- CI runs

## Milestone 1

- CPU register tests
- decoder tests
- instruction handler tests
- memory read/write tests
- minimal VM integration test
- deterministic execution test

## Milestone 2

- kernel boot test
- process lifecycle test
- scheduler behavior tests
- context switch test
- syscall dispatch test
- interrupt test

## Milestone 3

- path resolver tests
- filesystem operation tests
- shell parser tests
- shell built-in tests
- terminal runtime tests
- persistence test

## Milestone 4

- assembler parser tests
- label resolution tests
- bytecode encoding golden tests
- compile/run integration test

## Milestone 5

- Toy C lexer tests
- parser tests
- semantic diagnostics tests
- IR golden tests
- assembly generation golden tests
- source map tests

## Milestone 6

- debugger state machine tests
- breakpoint tests
- watch expression tests
- timeline tests
- replay tests
- source-level stepping tests

## Milestone 7

- UI component tests
- workspace integration tests
- E2E edit-compile-run-debug smoke
- accessibility smoke
- performance smoke

## Milestone 8

- tutorial E2E tests
- example program tests
- release validation
- deployment smoke

---

# 36. Bug Classification

Severity levels:

## Critical

- app cannot boot
- main demo broken
- data loss
- deterministic replay broken
- security issue
- production deployment broken

## High

- core package failing tests
- compiler emits wrong bytecode
- debugger steps incorrectly
- memory protection bypassed
- major accessibility blocker

## Medium

- UI panel broken but workaround exists
- diagnostic confusing
- performance budget regression
- minor persistence bug

## Low

- visual polish issue
- typo
- non-critical layout issue
- optional tutorial issue

Critical and high bugs block public release.

---

# 37. Regression Policy

When a bug is fixed:

1. Add a failing test that reproduces it.
2. Fix the bug.
3. Confirm test passes.
4. Add regression note if bug affected public behavior.
5. Update docs if needed.

No silent fixes for significant bugs.

---

# 38. Performance Regression Policy

If a performance budget regresses:

1. Identify affected scenario.
2. Capture before/after measurement.
3. Determine whether regression is acceptable.
4. If unacceptable, optimize or revert.
5. Add a performance test if regression is likely to recur.

Do not micro-optimize without measurements.

---

# 39. Accessibility Regression Policy

If a UI change affects keyboard, focus, contrast, screen reader output, or reduced motion:

1. Run accessibility checks.
2. Manually verify keyboard behavior.
3. Add or update tests where practical.
4. Document any accepted limitation.

Accessibility regressions should be treated like functional regressions.

---

# 40. Public Release Quality Bar

Before public release, NovaOS must satisfy:

- complete MVP user journey
- no critical bugs
- no high-severity known bugs without documented workaround
- core packages meet coverage targets or have justified exceptions
- E2E smoke suite passes
- public README is strong
- examples work
- tutorials work
- deployment works
- app loads on a clean browser profile
- reset works
- import/export does not corrupt data
- accessibility smoke passes
- performance smoke passes
- source code is readable
- architecture is documented

The public release should feel like a finished product, not a half-built demo.

---

# 41. Definition of Done

Testing, DevOps, security, and performance systems are complete when:

- root validation scripts exist
- CI runs build, typecheck, lint, tests, and architecture checks
- package-level tests exist for all core packages
- deterministic replay tests exist
- golden tests exist for compiler/assembler/source maps/traces
- integration tests cover major package boundaries
- E2E smoke tests cover main user flow
- accessibility smoke tests exist
- performance budgets are documented and checked
- security rules are enforced by code review and scripts
- architecture boundary checks exist
- release workflow exists
- deployment workflow exists
- documentation quality gates exist
- bug and regression policies are documented
- public release checklist is actionable
- Agent 48, 49, and 50 have clear ownership
- main branch remains buildable and demoable

---

# 42. Final Principle

NovaOS is impressive only if it works reliably.

A beautiful UI with a flaky simulator is not a systems project.

A compiler without golden tests is not trustworthy.

A debugger without deterministic replay is not educational.

A visual OS lab without accessibility is incomplete.

The quality system is what makes NovaOS credible.
