/**
 * Path utilities + total ordering for unknown values.
 *
 * `getPath` resolves dot-separated field paths (`a.b.0.c`) against plain
 * objects/arrays. `compareValues` defines a deterministic total order used
 * by sorting, `between`, and cursor comparisons: `null < boolean < number <
 * string < Date < array < object`, with heterogeneous types ordered by a
 * stable rank so results never depend on `typeof` surprises.
 *
 * @module RepositoryLayer/Engine
 */

/** Reads `row[path]` where `path` is `a.b.c`; returns `undefined` on any miss. */
export function getPath(row: unknown, path: string): unknown {
  if (row === null || typeof row !== 'object') return undefined;
  let cur: unknown = row;
  for (const seg of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/**
 * Deterministic rank per runtime type. Ties broken inside each type by
 * natural ordering; `null` ranks lowest so `ORDER BY` places missing values
 * first (matching Postgres `NULLS FIRST` default for ASC).
 */
function rank(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'boolean') return 1;
  if (typeof v === 'number') return 2;
  if (typeof v === 'bigint') return 3;
  if (typeof v === 'string') return 4;
  if (v instanceof Date) return 5;
  if (Array.isArray(v)) return 6;
  if (typeof v === 'object') return 7;
  return 8;
}

/**
 * Total-order compare: negative / zero / positive, or `null` when the
 * comparison is undefined (NaN involved). Deterministic across heterogeneous
 * inputs — critical for keyset pagination, where a comparator that isn't a
 * total order produces unstable pages.
 */
export function compareValues(a: unknown, b: unknown): number | null {
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;

  switch (ra) {
    case 0:
      return 0; // both null/undefined
    case 1:
      return Number(a) - Number(b);
    case 2: {
      const na = a as number;
      const nb = b as number;
      if (Number.isNaN(na) || Number.isNaN(nb)) return null;
      return na < nb ? -1 : na > nb ? 1 : 0;
    }
    case 3: {
      const ba = a as bigint;
      const bb = b as bigint;
      return ba < bb ? -1 : ba > bb ? 1 : 0;
    }
    case 4: {
      const sa = a as string;
      const sb = b as string;
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    }
    case 5:
      return (a as Date).getTime() - (b as Date).getTime();
    case 6: {
      // Lexicographic array compare (short-circuits at first divergence).
      const aa = a as unknown[];
      const bb = b as unknown[];
      const n = Math.min(aa.length, bb.length);
      for (let i = 0; i < n; i++) {
        const c = compareValues(aa[i], bb[i]);
        if (c === null) return null;
        if (c !== 0) return c;
      }
      return aa.length - bb.length;
    }
    default: {
      // Objects compare by stable serialization (sorted keys).
      return stableStringify(a) < stableStringify(b)
        ? -1
        : stableStringify(a) > stableStringify(b)
          ? 1
          : 0;
    }
  }
}

/**
 * JSON.stringify with sorted object keys — same value → same string across
 * key insertion orders. Used for object-rank comparisons and cursor keys.
 */
export function stableStringify(v: unknown): string {
  return JSON.stringify(sortDeep(v));
}

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v !== null && typeof v === 'object' && !(v instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = sortDeep((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v instanceof Date ? { $date: v.toISOString() } : v;
}
