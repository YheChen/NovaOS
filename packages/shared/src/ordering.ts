/**
 * Deterministic ordering helpers. Anywhere iteration order could affect
 * simulation outcome (map iteration, queue snapshots, serialization), use these
 * to fix a stable, explicit order.
 */
export function compareNumbers(a: number, b: number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Stable sort: ties preserve original order. */
export function stableSort<T>(items: readonly T[], compare: (a: T, b: T) => number): T[] {
  return items
    .map((value, index) => ({ value, index }))
    .sort((x, y) => {
      const c = compare(x.value, y.value);
      return c !== 0 ? c : x.index - y.index;
    })
    .map((entry) => entry.value);
}

export function sortedKeys<V>(map: ReadonlyMap<string, V>): string[] {
  return [...map.keys()].sort(compareStrings);
}

export function sortedEntries<V>(map: ReadonlyMap<string, V>): Array<[string, V]> {
  return sortedKeys(map).map((key) => [key, map.get(key) as V]);
}
