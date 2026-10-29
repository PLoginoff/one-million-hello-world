/**
 * Stream Processing Engine
 *
 * Real stream operators over an event-time model:
 * - **Windows**: tumbling, sliding (hopping), session (gap detection)
 * - **Watermarks**: heuristic watermark = maxEventTime - lateness bound;
 *   elements behind the watermark are counted as late and either dropped or
 *   routed to a side output
 * - **Aggregations**: count / sum / avg / min / max / custom fold per window
 * - **Joins**: interval join between two streams on a shared key
 * - **Stream-table join**: stub enriching stream elements from a table
 * - **Exactly-once**: idempotent sinks keyed on (windowEnd, key) plus
 *   checkpoint barriers that snapshot operator state for recovery
 *
 * The engine is *pull/push hybrid*: sources `emit()` records into named
 * input channels; operators are composed as a small DAG evaluated
 * per-record. All state is in-memory and deterministic — no timers, no IO.
 * Time only advances as records arrive (event-time processing).
 *
 * Complexity notes:
 * - Session windows: O(s) merge per record where s = overlapping sessions
 * - Tumbling/sliding: O(w) window touch per record, w = windows overlapped
 *   (size/slide for sliding windows)
 * - Interval join: O(log n) probe via sorted buffer per key
 *
 * @module StreamProcessingLayer/Implementations
 */

// ============================================================================
// Records & watermarks
// ============================================================================

/** A record flowing through the pipeline. */
export interface StreamRecord<T = unknown> {
  /** Event-time timestamp (ms). */
  readonly timestamp: number;
  /** Grouping key (may be undefined for global windows). */
  readonly key?: string;
  readonly value: T;
  /** Optional sequence/offset for exactly-once tracking. */
  readonly offset?: number;
}

/** A half-open window [start, end). */
export interface Window {
  readonly start: number;
  readonly end: number;
}

export type WindowAssigner = (timestamp: number) => Window[];

// ============================================================================
// Window assigners
// ============================================================================

/** Tumbling windows of fixed `size`, aligned to epoch. */
export function tumblingWindows(size: number): WindowAssigner {
  return (t) => {
    const start = Math.floor(t / size) * size;
    return [{ start, end: start + size }];
  };
}

/** Sliding (hopping) windows of `size` advancing every `slide`. */
export function slidingWindows(size: number, slide: number): WindowAssigner {
  return (t) => {
    // All windows of length `size` aligned to the `slide` grid (anchored at
    // the epoch, start >= 0) that contain t.
    const windows: Window[] = [];
    const latestStart = Math.floor(t / slide) * slide;
    // Earliest start such that start + size > t  →  start > t - size.
    const earliestStart = Math.floor((t - size) / slide) * slide + slide;
    for (let s = latestStart; s >= Math.max(0, earliestStart) && s + size > t; s -= slide) {
      windows.push({ start: s, end: s + size });
    }
    return windows;
  };
}

/**
 * Session windows are not produced by an assigner — they emerge from merging.
 * Kept for API symmetry: a session record seeds a window [t, t + gap).
 */
export function sessionWindows(_gap: number): WindowAssigner {
  return (t) => [{ start: t, end: t }]; // placeholder; sessions merge separately
}

// ============================================================================
// Aggregators
// ============================================================================

/** An aggregator folds values and can emit a result. */
export interface Aggregator<TIn, TAcc, TOut> {
  readonly name: string;
  createAccumulator(): TAcc;
  add(acc: TAcc, value: TIn): TAcc;
  getResult(acc: TAcc): TOut;
  /** Merge two accumulators (needed for session window merging). */
  merge(a: TAcc, b: TAcc): TAcc;
}

export function countAggregator<T>(): Aggregator<T, number, number> {
  return {
    name: 'count',
    createAccumulator: () => 0,
    add: (a) => a + 1,
    getResult: (a) => a,
    merge: (a, b) => a + b,
  };
}

export function sumAggregator(
  select: (v: unknown) => number = (v) => Number(v)
): Aggregator<unknown, number, number> {
  return {
    name: 'sum',
    createAccumulator: () => 0,
    add: (a, v) => a + select(v),
    getResult: (a) => a,
    merge: (a, b) => a + b,
  };
}

export function avgAggregator(
  select: (v: unknown) => number = (v) => Number(v)
): Aggregator<unknown, { sum: number; count: number }, number> {
  return {
    name: 'avg',
    createAccumulator: () => ({ sum: 0, count: 0 }),
    add: (a, v) => ({ sum: a.sum + select(v), count: a.count + 1 }),
    getResult: (a) => (a.count === 0 ? 0 : a.sum / a.count),
    merge: (a, b) => ({ sum: a.sum + b.sum, count: a.count + b.count }),
  };
}

export function minAggregator(
  select: (v: unknown) => number = (v) => Number(v)
): Aggregator<unknown, number, number> {
  return {
    name: 'min',
    createAccumulator: () => Number.POSITIVE_INFINITY,
    add: (a, v) => Math.min(a, select(v)),
    getResult: (a) => (a === Number.POSITIVE_INFINITY ? 0 : a),
    merge: (a, b) => Math.min(a, b),
  };
}

export function maxAggregator(
  select: (v: unknown) => number = (v) => Number(v)
): Aggregator<unknown, number, number> {
  return {
    name: 'max',
    createAccumulator: () => Number.NEGATIVE_INFINITY,
    add: (a, v) => Math.max(a, select(v)),
    getResult: (a) => (a === Number.NEGATIVE_INFINITY ? 0 : a),
    merge: (a, b) => Math.max(a, b),
  };
}

/** Build a custom fold aggregator. */
export function customAggregator<TIn, TAcc, TOut>(
  name: string,
  init: () => TAcc,
  add: (acc: TAcc, v: TIn) => TAcc,
  result: (acc: TAcc) => TOut,
  merge: (a: TAcc, b: TAcc) => TAcc
): Aggregator<TIn, TAcc, TOut> {
  return { name, createAccumulator: init, add, getResult: result, merge };
}

// ============================================================================
// Windowed aggregation operator
// ============================================================================

/** Emitted result for a closed window. */
export interface WindowResult<TOut> {
  readonly window: Window;
  readonly key: string;
  readonly value: TOut;
  /** Number of records folded into this window. */
  readonly count: number;
}

interface WindowState<TAcc> {
  start: number;
  end: number;
  acc: TAcc;
  count: number;
}

export type LatePolicy = 'drop' | 'side-output' | 'accept';

export interface WindowedAggregateOptions {
  /** Bound on allowed lateness: watermark = maxTimestamp - lateness. */
  allowedLatenessMs?: number;
  latePolicy?: LatePolicy;
  /** Session gap — required when `kind: 'session'`. */
  sessionGapMs?: number;
}

/**
 * Groups records by key and window, folds them with an aggregator, and emits
 * a result when a window's end passes the current watermark.
 */
export class WindowedAggregate<TIn, TAcc, TOut> {
  private readonly _windows = new Map<string, Map<number, WindowState<TAcc>>>();
  private _watermark = Number.NEGATIVE_INFINITY;
  private _maxTimestamp = Number.NEGATIVE_INFINITY;
  private _lateCount = 0;
  private _emitted: WindowResult<TOut>[] = [];
  private _lateRecords: StreamRecord<TIn>[] = [];

  constructor(
    private readonly _kind: 'tumbling' | 'sliding' | 'session',
    private readonly _assigner: WindowAssigner,
    private readonly _aggregator: Aggregator<TIn, TAcc, TOut>,
    private readonly _options: WindowedAggregateOptions = {}
  ) {}

  get watermark(): number {
    return this._watermark;
  }

  get lateCount(): number {
    return this._lateCount;
  }

  /** Late records captured when latePolicy is 'side-output'. */
  get lateRecords(): readonly StreamRecord<TIn>[] {
    return this._lateRecords;
  }

  /** Drain emitted window results. */
  drainResults(): WindowResult<TOut>[] {
    const out = this._emitted;
    this._emitted = [];
    return out;
  }

  /**
   * Process one record. Advances the watermark, then either folds the record
   * into its window(s) or classifies it as late.
   */
  process(record: StreamRecord<TIn>): void {
    // Advance watermark BEFORE classifying the record: the record's own
    // timestamp counts toward maxTimestamp.
    if (record.timestamp > this._maxTimestamp) this._maxTimestamp = record.timestamp;
    const lateness = this._options.allowedLatenessMs ?? 0;
    const wm = this._maxTimestamp - lateness;
    if (wm > this._watermark) this._watermark = wm;

    const key = record.key ?? '__global__';

    // Late? A record is late if its own timestamp is behind the watermark.
    if (record.timestamp < this._watermark) {
      this._lateCount++;
      switch (this._options.latePolicy ?? 'drop') {
        case 'drop':
          return;
        case 'side-output':
          this._lateRecords.push(record);
          return;
        case 'accept':
          break;
      }
    }

    if (this._kind === 'session') {
      this._processSession(key, record);
    } else {
      const wins = this._assigner(record.timestamp);
      // Skip windows that already closed — records arriving this late only
      // reach windows whose end is still ahead of the watermark.
      for (const w of wins) {
        if (w.end <= this._watermark) continue;
        this._addToWindow(key, w, record);
      }
    }

    // Fire any windows that are now behind the watermark.
    this._fireWindows();
  }

  /**
   * Force-emit all open windows (end-of-input / drain semantics).
   */
  flush(): void {
    for (const [key, windows] of this._windows) {
      for (const [, state] of windows) {
        this._emit(key, state);
      }
      windows.clear();
    }
  }

  /** Snapshot operator state for checkpointing. */
  snapshotState(): {
    watermark: number;
    maxTimestamp: number;
    windows: Array<{ key: string; start: number; end: number; acc: TAcc; count: number }>;
  } {
    const windows: Array<{ key: string; start: number; end: number; acc: TAcc; count: number }> =
      [];
    for (const [key, wins] of this._windows) {
      for (const [, s] of wins) {
        windows.push({ key, start: s.start, end: s.end, acc: s.acc, count: s.count });
      }
    }
    return { watermark: this._watermark, maxTimestamp: this._maxTimestamp, windows };
  }

  restoreState(s: {
    watermark: number;
    maxTimestamp: number;
    windows: Array<{ key: string; start: number; end: number; acc: TAcc; count: number }>;
  }): void {
    this._watermark = s.watermark;
    this._maxTimestamp = s.maxTimestamp;
    this._windows.clear();
    for (const w of s.windows) {
      let m = this._windows.get(w.key);
      if (!m) {
        m = new Map();
        this._windows.set(w.key, m);
      }
      m.set(w.start, { start: w.start, end: w.end, acc: w.acc, count: w.count });
    }
  }

  // -------------------------------------------------------------- internals

  private _windowKey(key: string): Map<number, WindowState<TAcc>> {
    let m = this._windows.get(key);
    if (!m) {
      m = new Map();
      this._windows.set(key, m);
    }
    return m;
  }

  private _addToWindow(key: string, w: Window, record: StreamRecord<TIn>): void {
    const windows = this._windowKey(key);
    const id = w.start;
    let state = windows.get(id);
    if (!state) {
      state = {
        start: w.start,
        end: w.end,
        acc: this._aggregator.createAccumulator(),
        count: 0,
      };
      windows.set(id, state);
    }
    state.acc = this._aggregator.add(state.acc, record.value);
    state.count++;
  }

  /**
   * Session windows: insert [t, t+gap) then merge all overlapping/adjacent
   * sessions for the key by folding their accumulators together.
   */
  private _processSession(key: string, record: StreamRecord<TIn>): void {
    const gap = this._options.sessionGapMs;
    if (!gap || gap <= 0) throw new Error('sessionGapMs required for session windows');
    const windows = this._windowKey(key);

    // New candidate session covering [t, t+gap).
    let merged: WindowState<TAcc> = {
      start: record.timestamp,
      end: record.timestamp + gap,
      acc: this._aggregator.add(this._aggregator.createAccumulator(), record.value),
      count: 1,
    };

    // Collect sessions that overlap or are within `gap` of the candidate.
    // Two sessions [a,b) and [c,d) merge iff c - b <= gap && a - d <= gap.
    const toRemove: number[] = [];
    for (const [id, s] of windows) {
      const overlaps =
        s.start <= merged.end + gap && merged.start <= s.end + gap;
      if (overlaps) {
        toRemove.push(id);
        merged = {
          start: Math.min(merged.start, s.start),
          end: Math.max(merged.end, s.end),
          acc: this._aggregator.merge(merged.acc, s.acc),
          count: merged.count + s.count,
        };
      }
    }
    for (const id of toRemove) windows.delete(id);
    windows.set(merged.start, merged);
  }

  private _fireWindows(): void {
    for (const [key, windows] of this._windows) {
      const fireable: number[] = [];
      for (const [id, s] of windows) {
        if (s.end <= this._watermark) fireable.push(id);
      }
      for (const id of fireable) {
        const s = windows.get(id);
        if (s) {
          this._emit(key, s);
          windows.delete(id);
        }
      }
      if (windows.size === 0) this._windows.delete(key);
    }
  }

  private _emit(key: string, state: WindowState<TAcc>): void {
    this._emitted.push({
      window: { start: state.start, end: state.end },
      key,
      value: this._aggregator.getResult(state.acc),
      count: state.count,
    });
  }
}

// ============================================================================
// Interval join
// ============================================================================

export interface JoinedPair<L, R> {
  readonly key: string;
  readonly left: StreamRecord<L>;
  readonly right: StreamRecord<R>;
}

/**
 * Interval join: a left record at time tL joins a right record at time tR
 * when `tR ∈ [tL + lowerBound, tL + upperBound]` on the same key.
 * Buffers are kept per-key, sorted by timestamp for O(log n) probing.
 */
export class IntervalJoin<L, R> {
  private readonly _left = new Map<string, StreamRecord<L>[]>();
  private readonly _right = new Map<string, StreamRecord<R>[]>();
  private readonly _output: JoinedPair<L, R>[] = [];
  private _watermark = Number.NEGATIVE_INFINITY;
  private _maxTs = Number.NEGATIVE_INFINITY;
  /** Max retained buffer time behind the watermark. */
  private readonly _retentionMs: number;
  private readonly _allowedLatenessMs: number;

  constructor(
    private readonly _lowerBoundMs: number,
    private readonly _upperBoundMs: number,
    options: { retentionMs?: number; allowedLatenessMs?: number } = {}
  ) {
    this._retentionMs = options.retentionMs ?? 60000;
    this._allowedLatenessMs = options.allowedLatenessMs ?? 0;
  }

  left(record: StreamRecord<L>): void {
    this._advance(record.timestamp);
    const buf = this._buffer(this._left, record.key ?? '', record);
    this._insertSorted(buf, record);
    // Probe right buffer: tR ∈ [tL + lower, tL + upper]
    const lo = record.timestamp + this._lowerBoundMs;
    const hi = record.timestamp + this._upperBoundMs;
    for (const r of this._rangeScan(this._right.get(record.key ?? '') ?? [], lo, hi)) {
      this._output.push({ key: record.key ?? '', left: record, right: r });
    }
    this._gc();
  }

  right(record: StreamRecord<R>): void {
    this._advance(record.timestamp);
    const buf = this._buffer(this._right, record.key ?? '', record);
    this._insertSorted(buf, record);
    // Probe left buffer: for each left tL, check record.ts ∈ [tL+lo, tL+hi]
    // → tL ∈ [tR - hi, tR - lo]
    const lo = record.timestamp - this._upperBoundMs;
    const hi = record.timestamp - this._lowerBoundMs;
    for (const l of this._rangeScan(this._left.get(record.key ?? '') ?? [], lo, hi)) {
      this._output.push({ key: record.key ?? '', left: l, right: record });
    }
    this._gc();
  }

  drain(): JoinedPair<L, R>[] {
    const out = this._output.slice();
    this._output.length = 0;
    return out;
  }

  private _advance(ts: number): void {
    if (ts > this._maxTs) this._maxTs = ts;
    const wm = this._maxTs - this._allowedLatenessMs;
    if (wm > this._watermark) this._watermark = wm;
  }

  private _buffer<M>(
    map: Map<string, StreamRecord<M>[]>,
    key: string,
    _r: StreamRecord<M>
  ): StreamRecord<M>[] {
    let b = map.get(key);
    if (!b) {
      b = [];
      map.set(key, b);
    }
    return b;
  }

  /** Binary-search insert keeping the buffer sorted by timestamp. O(log n) probe, O(n) shift. */
  private _insertSorted<M>(buf: StreamRecord<M>[], r: StreamRecord<M>): void {
    let lo = 0;
    let hi = buf.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (buf[mid].timestamp <= r.timestamp) lo = mid + 1;
      else hi = mid;
    }
    buf.splice(lo, 0, r);
  }

  /** Return records with timestamp in [lo, hi] via binary-search bounds. */
  private _rangeScan<M>(buf: StreamRecord<M>[], lo: number, hi: number): StreamRecord<M>[] {
    // Lower bound for lo
    let a = 0;
    let b = buf.length;
    while (a < b) {
      const m = (a + b) >> 1;
      if (buf[m].timestamp < lo) a = m + 1;
      else b = m;
    }
    // Upper bound for hi
    let c = a;
    let d = buf.length;
    while (c < d) {
      const m = (c + d) >> 1;
      if (buf[m].timestamp <= hi) c = m + 1;
      else d = m;
    }
    return buf.slice(a, c);
  }

  /**
   * Evict buffered records far behind the watermark.
   * A left record at tL can still match a right at tR ∈ [tL+lower, tL+upper].
   * The latest possible tR is bounded by current max timestamp + allowed
   * lateness slack, so we only drop records whose join window has fully
   * passed the watermark minus retention slack.
   */
  private _gc(): void {
    if (this._watermark === Number.NEGATIVE_INFINITY) return;
    const cutoff = this._watermark - this._retentionMs - Math.max(0, this._upperBoundMs);
    this._gcMap(this._left, cutoff);
    this._gcMap(this._right, cutoff);
  }

  private _gcMap<M>(map: Map<string, StreamRecord<M>[]>, cutoff: number): void {
    for (const [k, buf] of map) {
      const kept = buf.filter((r) => r.timestamp >= cutoff);
      if (kept.length === 0) map.delete(k);
      else if (kept.length !== buf.length) map.set(k, kept);
    }
  }
}

// ============================================================================
// Stream-table join (stub-ish but functional for in-memory tables)
// ============================================================================

/**
 * A lookup table with temporal semantics: rows carry a valid-from timestamp,
 * and lookups return the row valid at the record's event time (latest row
 * whose timestamp <= record timestamp).
 */
export class TemporalTable<Row> {
  private readonly _rows = new Map<string, StreamRecord<Row>[]>();

  put(key: string, row: Row, atTimestamp: number): void {
    let list = this._rows.get(key);
    if (!list) {
      list = [];
      this._rows.set(key, list);
    }
    const rec: StreamRecord<Row> = { timestamp: atTimestamp, key, value: row };
    // Keep sorted by timestamp (insertion sort — tables are small).
    let i = list.length;
    while (i > 0 && list[i - 1].timestamp > atTimestamp) i--;
    list.splice(i, 0, rec);
  }

  /** Latest row valid at `timestamp`, or undefined. */
  getAt(key: string, timestamp: number): Row | undefined {
    const list = this._rows.get(key);
    if (!list) return undefined;
    // Binary search: last row with timestamp <= ts.
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].timestamp <= timestamp) lo = mid + 1;
      else hi = mid;
    }
    return lo === 0 ? undefined : list[lo - 1].value;
  }

  size(): number {
    return this._rows.size;
  }
}

/** Enrich a stream with table lookups, as-of the record's event time. */
export function streamTableJoin<T, Row, Out>(
  records: readonly StreamRecord<T>[],
  table: TemporalTable<Row>,
  combine: (value: T, row: Row | undefined, record: StreamRecord<T>) => Out
): Array<StreamRecord<Out>> {
  return records.map((r) => ({
    timestamp: r.timestamp,
    key: r.key,
    offset: r.offset,
    value: combine(r.value, r.key !== undefined ? table.getAt(r.key, r.timestamp) : undefined, r),
  }));
}

// ============================================================================
// Exactly-once: checkpointing + idempotent sink
// ============================================================================

/** Operator state checkpointed by a barrier. */
export interface CheckpointSnapshot {
  readonly id: number;
  readonly timestamp: number;
  readonly operatorStates: Map<string, unknown>;
  readonly sourceOffsets: Map<string, number>;
}

/**
 * Idempotent sink: deduplicates writes by a caller-supplied key. On recovery,
 * already-applied keys are skipped — giving effectively-once delivery.
 */
export class IdempotentSink<T> {
  private readonly _applied = new Map<string, T>();
  private _writeCount = 0;
  private _duplicates = 0;

  /**
   * Write a value under `key`. Repeated writes with the same key are no-ops
   * (deduplicated) — the first value wins.
   */
  write(key: string, value: T): boolean {
    if (this._applied.has(key)) {
      this._duplicates++;
      return false;
    }
    this._applied.set(key, value);
    this._writeCount++;
    return true;
  }

  has(key: string): boolean {
    return this._applied.has(key);
  }

  get(key: string): T | undefined {
    return this._applied.get(key);
  }

  get writeCount(): number {
    return this._writeCount;
  }

  get duplicates(): number {
    return this._duplicates;
  }

  /** Restore applied keys from a checkpoint (for recovery). */
  restore(keys: readonly string[], values: readonly T[]): void {
    for (let i = 0; i < keys.length; i++) this._applied.set(keys[i], values[i]);
    this._writeCount = this._applied.size;
  }

  snapshot(): { keys: string[]; values: T[] } {
    return { keys: [...this._applied.keys()], values: [...this._applied.values()] };
  }

  entries(): IterableIterator<[string, T]> {
    return this._applied.entries();
  }
}

/**
 * Checkpoint coordinator: injects barriers at fixed record intervals and
 * snapshots registered operator state. Mirrors the Chandy–Lamport idea at a
 * single-node scale — state is captured when the barrier passes.
 */
export class CheckpointCoordinator {
  private _nextId = 1;
  private _recordsSinceBarrier = 0;
  private readonly _interval: number;
  private readonly _operators = new Map<string, { snapshotState(): unknown }>();
  private readonly _sources = new Map<string, { offset: number }>();
  private readonly _completed: CheckpointSnapshot[] = [];

  constructor(options: { barrierIntervalRecords?: number } = {}) {
    this._interval = options.barrierIntervalRecords ?? 100;
  }

  registerOperator(name: string, op: { snapshotState(): unknown }): void {
    this._operators.set(name, op);
  }

  registerSource(name: string, src: { offset: number }): void {
    this._sources.set(name, src);
  }

  /**
   * Called once per processed record. When the barrier interval is reached a
   * checkpoint is taken and returned; otherwise returns null.
   */
  recordProcessed(): CheckpointSnapshot | null {
    this._recordsSinceBarrier++;
    if (this._recordsSinceBarrier < this._interval) return null;
    this._recordsSinceBarrier = 0;
    return this.checkpoint();
  }

  /** Force a checkpoint now. */
  checkpoint(): CheckpointSnapshot {
    const snap: CheckpointSnapshot = {
      id: this._nextId++,
      timestamp: Date.now(),
      operatorStates: new Map(),
      sourceOffsets: new Map(),
    };
    for (const [name, op] of this._operators) {
      snap.operatorStates.set(name, op.snapshotState());
    }
    for (const [name, src] of this._sources) {
      snap.sourceOffsets.set(name, src.offset);
    }
    this._completed.push(snap);
    return snap;
  }

  lastCompleted(): CheckpointSnapshot | undefined {
    return this._completed[this._completed.length - 1];
  }

  completedCount(): number {
    return this._completed.length;
  }
}
