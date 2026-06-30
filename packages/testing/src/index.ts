export * from './event-assertions';
export * from './test-bus';

/** Convenience re-export: a seeded deterministic RNG for tests. */
export { createSeededRandom as seeded } from '@novaos/shared';

export const TESTING_VERSION = '0.0.0';
