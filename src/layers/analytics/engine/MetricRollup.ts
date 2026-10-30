/**
 * MetricRollup — pre-aggregated metric cubes at hourly and daily
 * grains.
 *
 * Analytics queries over raw events don't scale: "revenue per day by
 * country" would scan millions of rows. The standard fix is a
 * *rollup cube*: at ingest time we update small aggregate cells —
 * `(metric, grain, bucketStart, tagSet) → {count,sum,min,max}` —
 * so queries read O(buckets × tag-combos) cells instead of raw rows.
 *
 * One event updates exactly TWO cells per tag-set it carries (hour +
 * day), so ingestion stays O(1) per point regardless of history size.
 *
 * Tag sets are stored canonicalized (sorted `k=v` join) so
 * `{a:1,b:2}` and `{b:2,a:1}` hit the same cell. Queries can filter
 * on a subset of tags — implemented by scanning the metric's cell
 * index, which stays cheap because the number of *distinct* tag sets
 * per metric is bounded by cardinality, not event volume.
 *
 * Also supports a "wildcard" all-tags cell per bucket (empty tagSet)
 * that every point feeds — that's the fast path for
 * "total revenue per hour" with no slicing.
 *
 * Complexity: ingest O(tags) for canonicalization; query
 * O(cells-in-range). Space O(metric × buckets × distinct tag sets).
 *
 * @module AnalyticsLayer/Engine
 */

import {
  MetricPoint,
  RollupBucket,
  RollupCell,
  RollupGrain,
  RollupQuery,
} from './types';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

interface MutableCell {
  count: number;
  sum: number;
  min: number;
  max: number;
}

/** Canonical key for one cube cell. */
interface CellKey {
  readonly metric: string;
  readonly grain: RollupGrain;
  readonly bucketStart: number;
  /** canonicalized tag string; '' = the all-tags cell */
  readonly tagKey: string;
  readonly tags: Readonly<Record<string, string>>;
}

export class MetricRollup {
  /** flat map cell-key-string → aggregates. */
  private readonly _cells: Map<string, { key: CellKey; cell: MutableCell }>;

  constructor() {
    this._cells = new Map();
  }

  /** Ingest one point: updates hour + day cells, plus all-tags cells. */
  add(point: MetricPoint): void {
    if (!Number.isFinite(point.value)) {
      throw new RangeError('metric value must be finite');
    }
    const tags = point.tags ?? {};
    const tagKey = canonicalizeTags(tags);
    for (const grain of ['hour', 'day'] as const) {
      const bucketStart = bucketize(point.timestamp, grain);
      this._accumulate(
        {
          metric: point.metric,
          grain,
          bucketStart,
          tagKey,
          tags,
        },
        point.value
      );
      // The wildcard cell (no slicing needed).
      if (tagKey !== '') {
        this._accumulate(
          { metric: point.metric, grain, bucketStart, tagKey: '', tags: {} },
          point.value
        );
      }
    }
  }

  addAll(points: readonly MetricPoint[]): void {
    for (const p of points) this.add(p);
  }

  /**
   * Read cells matching a query: metric + grain, optional time range,
   * optional tag subset filter. Returns buckets sorted by start time.
   *
   * Tag filter semantics: a cell matches if it contains *at least* the
   * query tags — so `{country:'us'}` matches cells tagged
   * `{country:'us',plan:'pro'}` too (roll-up across unfiltered
   * dimensions requires an explicit `sum()` over the result or the
   * wildcard cell).
   */
  query(q: RollupQuery): RollupBucket[] {
    const out: RollupBucket[] = [];
    for (const { key, cell } of this._cells.values()) {
      if (key.metric !== q.metric || key.grain !== q.grain) continue;
      if (q.from !== undefined && key.bucketStart < q.from) continue;
      if (q.to !== undefined && key.bucketStart > q.to) continue;
      if (q.tags !== undefined && !tagsSuperset(key.tags, q.tags)) continue;
      out.push({ bucketStart: key.bucketStart, cell: freezeCell(cell) });
    }
    out.sort((a, b) => a.bucketStart - b.bucketStart);
    return out;
  }

  /**
   * Single number for a metric/grain over a time range: sums the
   * wildcard cells. Throws if `tags` are given — slice aggregates
   * need `query()` + manual reduce (summing overlapping tag sets
   * would double-count).
   */
  total(metric: string, grain: RollupGrain, from?: number, to?: number): number {
    // Wildcard cells only — iterating the superset-matched cells here
    // would double-count tagged cells alongside the wildcard.
    let sum = 0;
    for (const { key, cell } of this._cells.values()) {
      if (key.metric !== metric || key.grain !== grain || key.tagKey !== '') {
        continue;
      }
      if (from !== undefined && key.bucketStart < from) continue;
      if (to !== undefined && key.bucketStart > to) continue;
      sum += cell.sum;
    }
    return sum;
  }

  /** Distinct tag-key sets seen for a metric (cube inspection). */
  tagSetsOf(metric: string): ReadonlySet<string>[] {
    const sets: Set<string>[] = [];
    const seen = new Set<string>();
    for (const { key } of this._cells.values()) {
      if (key.metric !== metric) continue;
      if (seen.has(key.tagKey)) continue;
      seen.add(key.tagKey);
      sets.push(new Set(Object.keys(key.tags)));
    }
    return sets;
  }

  /** Number of materialized cells. */
  get cellCount(): number {
    return this._cells.size;
  }

  /** Drop all cells (testing / reset). */
  clear(): void {
    this._cells.clear();
  }

  /* ---------------------------------------------------------------- */
  /* Internals                                                          */
  /* ---------------------------------------------------------------- */

  private _accumulate(key: CellKey, value: number): void {
    const ks = keyString(key);
    let rec = this._cells.get(ks);
    if (rec === undefined) {
      rec = { key, cell: { count: 0, sum: 0, min: value, max: value } };
      this._cells.set(ks, rec);
    }
    const c = rec.cell;
    c.count++;
    c.sum += value;
    if (value < c.min) c.min = value;
    if (value > c.max) c.max = value;
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

/** Floor `t` to the start of its hour/day bucket. */
export function bucketize(t: number, grain: RollupGrain): number {
  const span = grain === 'hour' ? HOUR_MS : DAY_MS;
  return Math.floor(t / span) * span;
}

/** Sorted `k=v` join — makes tag-set equality order-insensitive. */
export function canonicalizeTags(tags: Readonly<Record<string, string>>): string {
  const keys = Object.keys(tags).sort();
  return keys.map((k) => `${k}=${tags[k]}`).join('&');
}

function keyString(k: CellKey): string {
  return `${k.metric}|${k.grain}|${k.bucketStart}|${k.tagKey}`;
}

/** Does `cellTags` contain every pair of `required`? */
function tagsSuperset(
  cellTags: Readonly<Record<string, string>>,
  required: Readonly<Record<string, string>>
): boolean {
  for (const [k, v] of Object.entries(required)) {
    if (cellTags[k] !== v) return false;
  }
  return true;
}

function freezeCell(c: MutableCell): RollupCell {
  return {
    count: c.count,
    sum: c.sum,
    min: c.min,
    max: c.max,
    mean: c.count > 0 ? c.sum / c.count : 0,
  };
}
