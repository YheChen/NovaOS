/**
 * Nominal ("branded") typing helper. A `Brand<T, B>` is structurally `T` at
 * runtime but distinct from `T` (and from other brands) at compile time, so an
 * `Address` can never be silently passed where a `Byte` is expected.
 */
export type Brand<T, B extends string> = T & { readonly __brand: B };
