/**
 * ResponseComposer — typed merge recipes over aggregated results.
 *
 * `AggregationEngine` hands back a `Map<name, T|null>`; the composer
 * turns that map into a *typed* response shape. The common recipes:
 *
 *   - `fields`   : object mapping outField → {source, pick?, default?}
 *                  ("profile.name" pulls `.name` out of subsystem
 *                  'profile's result);
 *   - `overlay`  : merge multiple subsystem objects into one, later
 *                  sources overwriting earlier — the "user = base ∪
 *                  preferences ∪ runtime overrides" pattern;
 *   - `zipBy`    : merge arrays keyed by id — e.g. join `orders[]` from
 *                  one service with `payments[]` from another by
 *                  `orderId`, producing combined rows.
 *
 * All recipes skip `null` (absent/failed optional subsystems) — the
 * caller declares defaults where absence isn't acceptable.
 *
 * @module FacadeLayer/Engine
 */

/** One field mapping for `fields`. */
export interface FieldMapping {
  /** Subsystem name supplying the value. */
  source: string;
  /** Path within the result (dot-separated); omit for whole result. */
  pick?: string;
  /** Value when the subsystem is absent/null. */
  default?: unknown;
}

/** Read `path` (dot-separated) out of an object. Returns undefined on any miss. */
function getPath(obj: unknown, path: string): unknown {
  if (obj === null || typeof obj !== 'object') return undefined;
  let cur: unknown = obj;
  for (const seg of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export class ResponseComposer {
  /**
   * Map subsystem results onto an output object's fields.
   * `spec`: outField → FieldMapping.
   */
  fields(results: ReadonlyMap<string, unknown | null>, spec: Record<string, FieldMapping>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [outField, m] of Object.entries(spec)) {
      const raw = results.get(m.source) ?? null;
      const value = raw === null ? undefined : m.pick !== undefined ? getPath(raw, m.pick) : raw;
      out[outField] = value === undefined ? m.default : value;
    }
    return out;
  }

  /**
   * Overlay-merge several subsystem objects left-to-right (later wins).
   * Non-object results are skipped. `null`s (absent subsystems) skipped.
   */
  overlay(results: ReadonlyMap<string, unknown | null>, sources: readonly string[]): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const name of sources) {
      const v = results.get(name);
      if (isPlainObject(v)) Object.assign(out, v);
    }
    return out;
  }

  /**
   * Join arrays from two subsystems on a shared key:
   * `zipBy(results, 'orders', 'payments', 'orderId', 'payment')`
   * produces `[{...order, payment: paymentRow|null}]`.
   */
  zipBy<L, R2>(
    results: ReadonlyMap<string, unknown | null>,
    leftSource: string,
    rightSource: string,
    key: string,
    rightField: string,
  ): Array<L & Record<string, unknown>> {
    const left = results.get(leftSource);
    const right = results.get(rightSource);
    const leftArr = Array.isArray(left) ? (left as L[]) : [];
    const rightArr = Array.isArray(right) ? (right as R2[]) : [];

    // Index right rows by key value.
    const rightIndex = new Map<unknown, R2>();
    for (const r of rightArr) {
      if (isPlainObject(r)) {
        const k = (r as Record<string, unknown>)[key];
        if (k !== undefined) rightIndex.set(k, r);
      }
    }

    return leftArr.map((l) => {
      const lk = isPlainObject(l) ? (l as Record<string, unknown>)[key] : undefined;
      const match = lk !== undefined ? rightIndex.get(lk) ?? null : null;
      return { ...(isPlainObject(l) ? (l as Record<string, unknown>) : {}), [rightField]: match } as L & Record<string, unknown>;
    });
  }
}
