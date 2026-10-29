/**
 * ML Feature Store — Core
 *
 * A feature store serves two worlds:
 *   - **Online**: low-latency point lookups (`user:42 → features`) for
 *     real-time inference. TTLs keep values fresh.
 *   - **Offline**: append-only, timestamped history per entity, used to
 *     build training datasets with *point-in-time correct* joins —
 *     each label is joined to feature values as they existed at the
 *     label's event time, never later (no leakage).
 *
 * This module provides the shared model + both stores + the PIT join
 * algorithm (an as-of merge on a sorted event log) + a transform
 * pipeline registry for computing derived features.
 *
 * @module MlFeatureStoreLayer/Engine
 */

import { IClock, SystemClock } from '../../observability/engine/signals';

/** Supported feature value types. */
export type FeatureValue = number | string | boolean | number[] | string[] | null;
export type FeatureType = 'int' | 'float' | 'string' | 'bool' | 'vector';

/** A registered feature definition. */
export interface FeatureDefinition {
  readonly name: string;
  readonly type: FeatureType;
  /** Owning team/owner for governance. */
  readonly owner: string;
  /** Time-to-live in the online store (ms). 0 = no expiry. */
  readonly ttlMs: number;
  /** Default value used when a lookup misses. */
  readonly defaultValue?: FeatureValue;
  readonly description?: string;
  /** Tags for discovery ('pii', 'realtime', 'batch:daily', ...). */
  readonly tags?: ReadonlyArray<string>;
}

/** A feature view groups related features sharing an entity + source. */
export interface FeatureView {
  readonly name: string;
  /** Entity key column(s) the features join on (e.g. 'user_id'). */
  readonly entity: string;
  readonly features: ReadonlyArray<FeatureDefinition>;
}

// ---------------------------------------------------------------------------
// Validation + coercion
// ---------------------------------------------------------------------------

export class FeatureTypeError extends Error {
  constructor(feature: string, expected: FeatureType, got: unknown) {
    super(`feature "${feature}": expected ${expected}, got ${typeof got}`);
    this.name = 'FeatureTypeError';
  }
}

/** Runtime type check. */
export function validateValue(def: FeatureDefinition, value: FeatureValue): boolean {
  if (value === null) return def.defaultValue !== undefined || def.ttlMs === 0;
  switch (def.type) {
    case 'int':
      return typeof value === 'number' && Number.isInteger(value);
    case 'float':
      return typeof value === 'number';
    case 'string':
      return typeof value === 'string';
    case 'bool':
      return typeof value === 'boolean';
    case 'vector':
      return Array.isArray(value) && value.every((v) => typeof v === 'number');
  }
}

// ---------------------------------------------------------------------------
// Online store — key-value with TTL freshness.
// ---------------------------------------------------------------------------

interface OnlineEntry {
  value: FeatureValue;
  writtenAtMs: number;
  ttlMs: number;
}

export interface OnlineStats {
  reads: number;
  writes: number;
  hits: number;
  misses: number;
  staleHits: number;
  evictions: number;
}

/**
 * In-memory online store. Keys are `<entity>:<entityId>:<feature>` to
 * keep the flat map simple; `getFeature(entity, id, feature)` and
 * `getFeatures` batch lookups.
 */
export class OnlineStore {
  private readonly _entries = new Map<string, OnlineEntry>();
  private readonly _defs = new Map<string, FeatureDefinition>();
  private readonly _clock: IClock;
  private _stats: OnlineStats = { reads: 0, writes: 0, hits: 0, misses: 0, staleHits: 0, evictions: 0 };

  constructor(clock: IClock = new SystemClock()) {
    this._clock = clock;
  }

  registerFeature(def: FeatureDefinition): void {
    this._defs.set(def.name, def);
  }

  private _key(entity: string, entityId: string, feature: string): string {
    return `${entity}:${entityId}:${feature}`;
  }

  /** Write a value. `ttlMs` overrides the registered default. */
  put(entity: string, entityId: string, feature: string, value: FeatureValue, ttlMs?: number): void {
    const def = this._defs.get(feature);
    if (def && !validateValue(def, value)) {
      throw new FeatureTypeError(feature, def.type, value);
    }
    const ttl = ttlMs ?? def?.ttlMs ?? 0;
    this._entries.set(this._key(entity, entityId, feature), {
      value,
      writtenAtMs: this._clock.nowMs(),
      ttlMs: ttl,
    });
    this._stats.writes++;
  }

  /** Is the stored value still fresh? */
  private _fresh(e: OnlineEntry): boolean {
    return e.ttlMs === 0 || this._clock.nowMs() - e.writtenAtMs < e.ttlMs;
  }

  get(entity: string, entityId: string, feature: string): FeatureValue | undefined {
    this._stats.reads++;
    const e = this._entries.get(this._key(entity, entityId, feature));
    if (!e) {
      this._stats.misses++;
      return this._defs.get(feature)?.defaultValue;
    }
    if (!this._fresh(e)) {
      this._stats.staleHits++;
      return this._defs.get(feature)?.defaultValue;
    }
    this._stats.hits++;
    return e.value;
  }

  /** Batch lookup for a feature vector. Missing values use defaults. */
  getFeatures(
    entity: string,
    entityId: string,
    features: ReadonlyArray<string>
  ): Record<string, FeatureValue | undefined> {
    const out: Record<string, FeatureValue | undefined> = {};
    for (const f of features) out[f] = this.get(entity, entityId, f);
    return out;
  }

  /** Age of the freshest write to a feature, for freshness monitoring. */
  lastWrittenMs(entity: string, entityId: string, feature: string): number | undefined {
    return this._entries.get(this._key(entity, entityId, feature))?.writtenAtMs;
  }

  /** Drop expired entries; returns count evicted. */
  evictExpired(): number {
    let n = 0;
    for (const [k, e] of this._entries) {
      if (!this._fresh(e)) {
        this._entries.delete(k);
        n++;
      }
    }
    this._stats.evictions += n;
    return n;
  }

  size(): number {
    return this._entries.size;
  }

  getStats(): OnlineStats {
    return { ...this._stats };
  }
}

// ---------------------------------------------------------------------------
// Offline store — append-only, time-stamped per entity.
// ---------------------------------------------------------------------------

/** One row in the offline log. */
export interface OfflineRow {
  readonly entityId: string;
  readonly timestampMs: number;
  /** feature name → value at that time */
  readonly values: Record<string, FeatureValue>;
}

/**
 * Append-only history per entity. Rows per entity are kept sorted by
 * timestamp (appends arrive in order in the common case; out-of-order
 * inserts binary-search their slot).
 */
export class OfflineStore {
  private readonly _log = new Map<string, OfflineRow[]>();
  private readonly _defs = new Map<string, FeatureDefinition>();

  registerFeature(def: FeatureDefinition): void {
    this._defs.set(def.name, def);
  }

  /** Append a row for an entity at `timestampMs`. */
  append(entityId: string, timestampMs: number, values: Record<string, FeatureValue>): void {
    for (const [f, v] of Object.entries(values)) {
      const def = this._defs.get(f);
      if (def && !validateValue(def, v)) throw new FeatureTypeError(f, def.type, v);
    }
    const row: OfflineRow = { entityId, timestampMs, values: { ...values } };
    let arr = this._log.get(entityId);
    if (!arr) {
      arr = [];
      this._log.set(entityId, arr);
    }
    // Keep sorted by timestamp — insertion sort on the tail is O(1)
    // for in-order appends, O(log n + shift) for late arrivals.
    if (arr.length === 0 || arr[arr.length - 1].timestampMs <= timestampMs) {
      arr.push(row);
      return;
    }
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (arr[mid].timestampMs <= timestampMs) lo = mid + 1;
      else hi = mid;
    }
    arr.splice(lo, 0, row);
  }

  /** All rows for an entity, oldest → newest. */
  history(entityId: string): ReadonlyArray<OfflineRow> {
    return this._log.get(entityId) ?? [];
  }

  /**
   * Latest value per feature at or before `asOfMs` — the "as-of" read
   * used by point-in-time joins.
   */
  asOf(entityId: string, asOfMs: number): Record<string, FeatureValue> | undefined {
    const arr = this._log.get(entityId);
    if (!arr) return undefined;
    const out: Record<string, FeatureValue> = {};
    // Walk back from the end: first occurrence per feature wins.
    for (let i = arr.length - 1; i >= 0; i--) {
      const row = arr[i];
      if (row.timestampMs > asOfMs) continue;
      for (const [f, v] of Object.entries(row.values)) {
        if (!(f in out)) out[f] = v;
      }
      // Early exit when we've passed all rows ≤ asOfMs AND filled every
      // feature seen so far — simple bound: stop when timestamps are all
      // ≤ asOfMs and we've seen every key once. We keep scanning to be
      // safe with sparse features.
    }
    return out;
  }

  entityIds(): string[] {
    return [...this._log.keys()];
  }

  rowCount(entityId?: string): number {
    if (entityId !== undefined) return this._log.get(entityId)?.length ?? 0;
    let n = 0;
    for (const a of this._log.values()) n += a.length;
    return n;
  }
}

// ---------------------------------------------------------------------------
// Point-in-time join — leak-free label→feature merge.
// ---------------------------------------------------------------------------

/** One labelled example the caller wants features for. */
export interface LabelRow {
  readonly entityId: string;
  /** The event time — only features at/before this are joined. */
  readonly timestampMs: number;
  readonly label: FeatureValue;
}

/** Output row: label + as-of features. */
export interface TrainingRow {
  readonly entityId: string;
  readonly timestampMs: number;
  readonly label: FeatureValue;
  readonly features: Record<string, FeatureValue | undefined>;
}

/**
 * As-of join: for each label row, take the latest offline-store values
 * whose timestamp ≤ the label's timestamp. Walking the entity's history
 * backwards from the label time is O(H) per label where H = history
 * length — acceptable for moderate histories; a cursor-based merge
 * would be O(H + L) for sorted label streams.
 */
export function pointInTimeJoin(
  store: OfflineStore,
  labels: ReadonlyArray<LabelRow>,
  featureNames?: ReadonlyArray<string>
): TrainingRow[] {
  const out: TrainingRow[] = [];
  for (const l of labels) {
    const all = store.asOf(l.entityId, l.timestampMs) ?? {};
    const features: Record<string, FeatureValue | undefined> = {};
    if (featureNames) {
      for (const f of featureNames) features[f] = all[f];
    } else {
      for (const [k, v] of Object.entries(all)) features[k] = v;
    }
    out.push({ entityId: l.entityId, timestampMs: l.timestampMs, label: l.label, features });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Transform pipelines — registry of vectorized feature ops.
// ---------------------------------------------------------------------------

/** A transform computes a derived feature from base features. */
export interface IFeatureTransform {
  readonly name: string;
  readonly inputs: ReadonlyArray<string>;
  readonly output: string;
  /** Compute one row → output value. */
  apply(inputs: Record<string, FeatureValue | undefined>): FeatureValue;
}

export class TransformRegistry {
  private readonly _transforms = new Map<string, IFeatureTransform>();

  register(t: IFeatureTransform): void {
    this._transforms.set(t.name, t);
  }

  get(name: string): IFeatureTransform | undefined {
    return this._transforms.get(name);
  }

  /**
   * Run all registered transforms over a row, in dependency order
   * (topological sort on input/output edges). Returns the enriched row.
   * Throws on cycles.
   */
  applyAll(row: Record<string, FeatureValue | undefined>): Record<string, FeatureValue | undefined> {
    const ordered = this._topoOrder();
    const out: Record<string, FeatureValue | undefined> = { ...row };
    for (const t of ordered) {
      out[t.output] = t.apply(out);
    }
    return out;
  }

  /** Topological order of transforms (Kahn's algorithm). */
  private _topoOrder(): IFeatureTransform[] {
    const producedBy = new Map<string, IFeatureTransform>();
    for (const t of this._transforms.values()) producedBy.set(t.output, t);
    const indegree = new Map<string, number>();
    const deps = new Map<string, string[]>();
    for (const t of this._transforms.values()) {
      const ds = t.inputs.filter((i) => producedBy.has(i));
      deps.set(t.name, ds);
      indegree.set(t.name, ds.length);
    }
    const queue = [...this._transforms.values()].filter((t) => (indegree.get(t.name) ?? 0) === 0);
    const out: IFeatureTransform[] = [];
    while (queue.length) {
      const t = queue.shift()!;
      out.push(t);
      for (const [name, ds] of deps) {
        if (ds.includes(t.output)) {
          const d = (indegree.get(name) ?? 0) - 1;
          indegree.set(name, d);
          if (d === 0) queue.push(this._transforms.get(name)!);
        }
      }
    }
    if (out.length !== this._transforms.size) {
      throw new Error('transform dependency cycle detected');
    }
    return out;
  }

  list(): IFeatureTransform[] {
    return [...this._transforms.values()];
  }
}

/** Built-in vectorized transforms. */
export const Transforms = {
  ratio(numerator: string, denominator: string, output: string, zeroFill = 0): IFeatureTransform {
    return {
      name: `ratio:${output}`,
      inputs: [numerator, denominator],
      output,
      apply(inputs) {
        const n = inputs[numerator];
        const d = inputs[denominator];
        if (typeof n !== 'number' || typeof d !== 'number' || d === 0) return zeroFill;
        return n / d;
      },
    };
  },
  zScore(input: string, output: string, mean: number, stddev: number): IFeatureTransform {
    return {
      name: `zscore:${output}`,
      inputs: [input],
      output,
      apply(inputs) {
        const v = inputs[input];
        return typeof v === 'number' && stddev !== 0 ? (v - mean) / stddev : 0;
      },
    };
  },
  bucketize(input: string, output: string, boundaries: ReadonlyArray<number>): IFeatureTransform {
    return {
      name: `bucket:${output}`,
      inputs: [input],
      output,
      apply(inputs) {
        const v = inputs[input];
        if (typeof v !== 'number') return -1;
        let i = 0;
        while (i < boundaries.length && v >= boundaries[i]) i++;
        return i;
      },
    };
  },
  log1p(input: string, output: string): IFeatureTransform {
    return {
      name: `log1p:${output}`,
      inputs: [input],
      output,
      apply(inputs) {
        const v = inputs[input];
        return typeof v === 'number' ? Math.log1p(Math.max(0, v)) : 0;
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Training set builder + freshness monitor.
// ---------------------------------------------------------------------------

export interface TrainingSet {
  readonly columns: ReadonlyArray<string>;
  readonly rows: ReadonlyArray<ReadonlyArray<FeatureValue | undefined>>;
}

/**
 * Builds a deterministic training matrix: rows sorted by (entityId,
 * timestampMs) then columns in declared order — so two runs over the
 * same data produce byte-identical output.
 */
export function buildTrainingSet(
  rows: ReadonlyArray<TrainingRow>,
  featureColumns: ReadonlyArray<string>
): TrainingSet {
  const sorted = [...rows].sort(
    (a, b) => a.entityId.localeCompare(b.entityId) || a.timestampMs - b.timestampMs
  );
  return {
    columns: featureColumns,
    rows: sorted.map((r) => featureColumns.map((c) => r.features[c])),
  };
}

export interface FreshnessReport {
  readonly feature: string;
  readonly entity: string;
  readonly entityId: string;
  readonly lastWrittenMs: number | undefined;
  readonly ageMs: number | undefined;
  readonly stale: boolean;
}

/** Scans the online store and reports stale features past their TTL. */
export class FreshnessMonitor {
  private readonly _store: OnlineStore;
  private readonly _clock: IClock;
  private readonly _watched: Array<{ entity: string; entityId: string; feature: string; maxAgeMs: number }> = [];

  constructor(store: OnlineStore, clock: IClock = new SystemClock()) {
    this._store = store;
    this._clock = clock;
  }

  watch(entity: string, entityId: string, feature: string, maxAgeMs: number): void {
    this._watched.push({ entity, entityId, feature, maxAgeMs });
  }

  report(): FreshnessReport[] {
    const now = this._clock.nowMs();
    return this._watched.map((w) => {
      const last = this._store.lastWrittenMs(w.entity, w.entityId, w.feature);
      const age = last === undefined ? undefined : now - last;
      return {
        feature: w.feature,
        entity: w.entity,
        entityId: w.entityId,
        lastWrittenMs: last,
        ageMs: age,
        stale: last === undefined || (age !== undefined && age > w.maxAgeMs),
      };
    });
  }
}
