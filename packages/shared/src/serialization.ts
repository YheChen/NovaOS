/**
 * Versioning wrappers and stable serialization. All snapshots, events, examples,
 * and persisted documents carry version information so they can be migrated as
 * the project evolves. `stableStringify` sorts object keys so serialized output
 * is deterministic and diffable (important for golden tests).
 */
export interface Versioned<T> {
  readonly schemaVersion: string;
  readonly data: T;
}

export interface PersistedDocument<T> {
  readonly version: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly data: T;
}

export function versioned<T>(schemaVersion: string, data: T): Versioned<T> {
  return { schemaVersion, data };
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value !== null && typeof value === 'object') {
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(input).sort()) {
      output[key] = sortValue(input[key]);
    }
    return output;
  }
  return value;
}
