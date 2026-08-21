# @novaos/ui

> Reusable, domain-agnostic design-system components.

**Status:** unused scaffold. The workspace's components live in `apps/web`;
this package is kept only so the architecture check can assert that a
domain-agnostic UI package imports no domain package.

See [`docs/specs/`](../../docs/specs) for the authoritative specification.

## Dependency Rules

Exports only through `src/index.ts` and follows the boundary rules enforced by
`pnpm check:arch`.
