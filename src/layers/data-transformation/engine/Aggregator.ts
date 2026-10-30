/**
 * Aggregator
 *
 * Group-by + fold aggregation. Items are bucketed by the stringified value
 * at `groupBy` path; each fold then reduces the group's values into one
 * accumulator field in the group's output object.
 *
 * Data structure: a `Map<string, GroupState>` preserves first-seen group
 * order (insertion-ordered iteration) — output groups appear in the order
 * their keys first occurred in the input. O(n) bucketing, O(n) folds since
 * each item is visited once per fold via a streaming accumulator (no
 * intermediate per-group arrays for numeric folds; 'collect'/'concat' do
 * materialize, by definition).
 *
 * Streaming folds:
 *   count — number of non-undefined source values
 *   sum/min/max/avg — numeric accumulators (non-numeric values are skipped,
 *     avg tracks count separately)
 *   first/last — first/last defined value
 *   collect — array of all values (memory-bound by design)
 *   concat — flattened concatenation of array values
 *   {op, initial} — custom left fold
 *
 * @module DataTransformationLayer/Engine
 */

import { getPath, parsePath } from './Path';
import { AggregateResult, AggregateSpec, FoldSpec } from './types';

/**
 * Mutable accumulator for one fold over one group.
 */
interface Accumulator {
  value: unknown;
  /** aux state: count for avg, seen flag for first, etc. */
  aux: number;
  seen: boolean;
}

interface GroupState {
  key: unknown;
  keyString: string;
  count: number;
  accumulators: Accumulator[];
}

export class Aggregator {
  /**
   * Runs a group-by aggregation over `items`.
   */
  aggregate(items: readonly Record<string, unknown>[], spec: AggregateSpec): AggregateResult {
    const groupByPath = parsePath(spec.groupBy);
    const foldPaths = spec.folds.map((f) => (f.source === '' ? null : parsePath(f.source)));

    const groups = new Map<string, GroupState>();
    const order: GroupState[] = [];

    for (const item of items) {
      const keyValue = getPath(item, groupByPath);
      const keyString = stringifyKey(keyValue);

      let state = groups.get(keyString);
      if (!state) {
        state = {
          key: keyValue,
          keyString,
          count: 0,
          accumulators: spec.folds.map(() => ({ value: undefined, aux: 0, seen: false })),
        };
        groups.set(keyString, state);
        order.push(state);
      }
      state.count += 1;

      spec.folds.forEach((fold, i) => {
        const path = foldPaths[i];
        const value = path === null ? item : getPath(item, path);
        this.foldInto(state!.accumulators[i], fold, value);
      });
    }

    const out = order.map((state) => this.emitGroup(state, spec));
    return { groups: out, groupCount: out.length, inputCount: items.length };
  }

  // -------------------------------------------------------------------

  private foldInto(acc: Accumulator, fold: FoldSpec, value: unknown): void {
    const kind = fold.fold;
    if (typeof kind === 'object' && kind !== null && 'op' in kind) {
      // custom fold — undefined values still feed the op unless acc seeded
      acc.value = acc.seen ? kind.op(acc.value, value) : kind.op(fold.initial, value);
      acc.seen = true;
      return;
    }

    switch (kind as string) {
      case 'count':
        if (value !== undefined && value !== null) {
          acc.aux += 1;
          acc.value = acc.aux;
          acc.seen = true;
        }
        return;
      case 'sum': {
        const n = toNumberOrNull(value);
        if (n !== null) {
          acc.value = (acc.seen ? (acc.value as number) : 0) + n;
          acc.seen = true;
        }
        return;
      }
      case 'min': {
        const n = toNumberOrNull(value);
        if (n !== null && (!acc.seen || n < (acc.value as number))) {
          acc.value = n;
          acc.seen = true;
        }
        return;
      }
      case 'max': {
        const n = toNumberOrNull(value);
        if (n !== null && (!acc.seen || n > (acc.value as number))) {
          acc.value = n;
          acc.seen = true;
        }
        return;
      }
      case 'avg': {
        const n = toNumberOrNull(value);
        if (n !== null) {
          acc.value = (acc.seen ? (acc.value as number) : 0) + n;
          acc.aux += 1;
          acc.seen = true;
        }
        return;
      }
      case 'first':
        if (!acc.seen && value !== undefined) {
          acc.value = value;
          acc.seen = true;
        }
        return;
      case 'last':
        if (value !== undefined) {
          acc.value = value;
          acc.seen = true;
        }
        return;
      case 'collect':
        if (value !== undefined) {
          if (!acc.seen) {
            acc.value = [value];
            acc.seen = true;
          } else {
            (acc.value as unknown[]).push(value);
          }
        }
        return;
      case 'concat':
        if (Array.isArray(value)) {
          if (!acc.seen) {
            acc.value = [...value];
            acc.seen = true;
          } else {
            (acc.value as unknown[]).push(...value);
          }
        } else if (value !== undefined) {
          if (!acc.seen) {
            acc.value = [value];
            acc.seen = true;
          } else {
            (acc.value as unknown[]).push(value);
          }
        }
        return;
      default:
        throw new Error(`Unknown fold kind '${String(kind)}'`);
    }
  }

  private emitGroup(state: GroupState, spec: AggregateSpec): Record<string, unknown> {
    const out: Record<string, unknown> = {
      [spec.groupBy]: state.key,
      __count: state.count,
    };
    spec.folds.forEach((fold, i) => {
      const acc = state.accumulators[i];
      let value = acc.seen ? acc.value : fold.initial ?? null;
      if (fold.fold === 'avg' && acc.seen) {
        value = acc.aux === 0 ? null : (acc.value as number) / acc.aux;
      }
      if (fold.fold === 'count') {
        value = acc.aux;
      }
      out[fold.target] = value;
    });
    return out;
  }
}

/**
 * Stable group-key stringification — objects sort keys so {a,b} ≡ {b,a}.
 */
function stringifyKey(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return `${typeof value}:${String(value)}`;
  }
  if (Array.isArray(value)) {
    return `array:[${value.map(stringifyKey).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  return `object:{${Object.keys(obj)
    .sort()
    .map((k) => `${k}:${stringifyKey(obj[k])}`)
    .join(',')}}`;
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}
