# ADR-0005: Workspace UI is a Vite React SPA (not Next.js)

## Status

Accepted

## Context

Spec 07 names Next.js + React + Monaco for the workspace UI (Milestone 7). The
NovaOS workspace is, however, a **fully client-side, deterministic simulator**:
the CPU, kernel, filesystem, compiler, and debugger all run in the browser with
no backend, no data fetching, and no server-rendered content. The gate
toolchain is strict (single root `tsc`, esbuild/tsup builds, ESLint flat config,
Turborepo, Playwright) and the architecture check forbids domain packages from
importing UI libraries.

## Decision

Build `apps/web` as a **Vite + React single-page app** (TypeScript, `react-jsx`
runtime). The UI consumes the domain packages' public snapshot contracts
(`compileToyC` / `CompilerInspectorSnapshot`, `createProgramRunner`,
`createDebugger` / `DebuggerSnapshot`) directly in the browser — there is no
server tier to add.

- Editing uses a controlled `<textarea>` for Version 1 (a real editor surface
  that feeds the real compiler); swapping in Monaco is a self-contained
  follow-up that does not change any domain contract.
- `apps/web` is typechecked by its own `tsconfig` with `jsx` enabled (root
  `tsc` only globs `.ts`, so JSX never reaches the root typecheck); its `build`
  runs `tsc --noEmit && vite build` so type errors still fail the build gate.
- Playwright drives the built SPA via a `webServer` block (`vite preview` on
  port 3000).

## Consequences

- Much simpler integration into the existing static-build monorepo: no SSR,
  no server runtime, no hydration concerns with domain singletons, trivial
  static hosting (any CDN).
- The "no fake UI behavior" rule is naturally satisfied — every panel renders a
  real snapshot produced by the domain packages; there is no server state to
  mock.
- Diverges from the spec's named framework. If a future milestone needs SSR,
  file-based routing, or server actions, migrating the SPA to Next.js is
  possible but unnecessary for v1.

## Alternatives Considered

- **Next.js (as specced).** Rejected for v1: its server/SSR features are unused
  by a client-only simulator and add build/hydration complexity and risk to the
  green gates for no user-facing benefit.
- **Plain Vite + vanilla TS (no React).** Rejected: the multi-panel debugger UI
  benefits from React's component model and the spec's React contracts.
