/**
 * StateBackend — pluggable keyed state for stream operators.
 *
 * Stream operators (windows, joins, dedup) keep per-key state. Where
 * that state lives is a deployment decision, not a pipeline decision —
 * so the backend is an interface, not a class:
 *
 *   InMemoryStateBackend   — Map-of-Maps; zero deps, for tests/dev.
 *                            O(1) get/put, O(n) scan.
 *
 *   LsmStateBackend        — RocksDB-shaped stub: mutable memtable +
 *                            tiered immutable SSTables + WAL + bloom
 *                            filters + periodic merge compaction.
 *                            Implements the real LSM read path
 *                            (memtable → newest SSTable → … → oldest)
 *                            so tests exercise correctness under flush
 *                            and compaction, not just a sorted array.
 *
 * Both satisfy `KeyedStateBackend`, which is deliberately minimal —
 * it's the contract `StateMigrator` and operator state stores need:
 * namespaced (per operator), per-partition, iterable, snapshotable.
 *
 * The LSM stub's job is *fidelity of semantics*, not performance:
 * bloom filters make `get` return "definitely absent" without scanning
 * SSTables (the real reason LSMs put them in), the WAL gives
 * crash-recovery ordering, and compaction drops tombstones exactly the
 * way RocksDB does (a delete marker disappears only when the bottom
 * level is reached — until then it must shadow older values).
 *
 * @module StreamProcessing/Engine
 */

// ---------------------------------------------------------------------
// Backend contract
// ---------------------------------------------------------------------

/** A serialized value — backends store bytes, operators own codecs. */
export type StateValue = Uint8Array;

/**
 * Namespaced, partition-aware keyed store. "Namespace" is the operator
 * id ("join.left-buffer", "dedup.keys"); "partition" is the processing
 * partition (0..P-1) a rescale may re-shuffle.
 */
export interface KeyedStateBackend {
  /** Open (or create) a namespace; idempotent. */
  registerNamespace(ns: string): void;
  /** Read one key. Undefined = absent (never returns tombstones). */
  get(ns: string, partition: number, key: string): StateValue | undefined;
  /** Write one key. Overwrites any prior value. */
  put(ns: string, partition: number, key: string, value: StateValue): void;
  /** Delete one key (writes a tombstone in LSM backends). */
  delete(ns: string, partition: number, key: string): void;
  /**
   * Iterate all live entries in (ns, partition), key-sorted.
   * Backends materialize this as a snapshot — mutations during iteration
   * do not affect the emitted pairs.
   */
  entries(ns: string, partition: number): [string, StateValue][];
  /** Count of live entries — `entries().length` but cheaper where possible. */
  count(ns: string, partition: number): number;
  /**
   * Full state image of one namespace (all partitions) for migration /
   * checkpoint. Format is backend-private — `restore` must accept it.
   */
  snapshot(ns: string): BackendSnapshot;
  /** Restore a snapshot taken by `snapshot` (possibly on another backend). */
  restore(ns: string, snap: BackendSnapshot): void;
  /** Partitions that currently hold state in a namespace. */
  partitions(ns: string): number[];
  /** Drop a namespace entirely. */
  dropNamespace(ns: string): void;
  /** Backend kind tag, for diagnostics. */
  readonly kind: string;
}

/** Portable state image — the wire format between backends. */
export interface BackendSnapshot {
  readonly namespace: string;
  /** partition -> key -> value (hex-ish encoded via plain copy). */
  readonly entries: { partition: number; key: string; value: StateValue }[];
}

// ---------------------------------------------------------------------
// In-memory backend
// ---------------------------------------------------------------------

/**
 * Reference implementation: `Map<ns, Map<partition, Map<key, value>>>`.
 * O(1) get/put/delete, O(n) entries (sorted on demand).
 */
export class InMemoryStateBackend implements KeyedStateBackend {
  readonly kind = 'in-memory';
  private readonly _data = new Map<string, Map<number, Map<string, StateValue>>>();

  registerNamespace(ns: string): void {
    if (!this._data.has(ns)) this._data.set(ns, new Map());
  }

  private _ns(ns: string): Map<number, Map<string, StateValue>> {
    const m = this._data.get(ns);
    if (!m) throw new Error(`unknown namespace '${ns}'`);
    return m;
  }

  private _partition(ns: string, partition: number): Map<string, StateValue> {
    const nsMap = this._ns(ns);
    let p = nsMap.get(partition);
    if (!p) {
      p = new Map();
      nsMap.set(partition, p);
    }
    return p;
  }

  get(ns: string, partition: number, key: string): StateValue | undefined {
    return this._ns(ns).get(partition)?.get(key);
  }

  put(ns: string, partition: number, key: string, value: StateValue): void {
    this._partition(ns, partition).set(key, value);
  }

  delete(ns: string, partition: number, key: string): void {
    this._ns(ns).get(partition)?.delete(key);
  }

  entries(ns: string, partition: number): [string, StateValue][] {
    const p = this._ns(ns).get(partition);
    if (!p) return [];
    return [...p.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  }

  count(ns: string, partition: number): number {
    return this._ns(ns).get(partition)?.size ?? 0;
  }

  snapshot(ns: string): BackendSnapshot {
    const entries: BackendSnapshot['entries'] = [];
    for (const [partition, p] of this._ns(ns)) {
      for (const [key, value] of p) entries.push({ partition, key, value });
    }
    return { namespace: ns, entries };
  }

  restore(ns: string, snap: BackendSnapshot): void {
    this.registerNamespace(ns);
    const nsMap = this._ns(ns);
    for (const e of snap.entries) {
      let p = nsMap.get(e.partition);
      if (!p) {
        p = new Map();
        nsMap.set(e.partition, p);
      }
      p.set(e.key, e.value);
    }
  }

  partitions(ns: string): number[] {
    return [...this._ns(ns).keys()].sort((a, b) => a - b);
  }

  dropNamespace(ns: string): void {
    this._data.delete(ns);
  }
}

// ---------------------------------------------------------------------
// LSM-tree backend (RocksDB-shaped stub)
// ---------------------------------------------------------------------

/**
 * Bloom filter — bit array + k hash probes. False positives possible
 * ("maybe present"), false negatives impossible ("definitely absent") —
 * which is exactly what an LSM needs: a bloom miss skips the SSTable
 * read entirely.
 *
 * Sized from expected items n and target false-positive rate p:
 *   bits m = -n·ln(p) / (ln 2)²   and   k = (m/n)·ln 2
 * — the standard optimal-bloom formulas (they're in the tests).
 */
export class BloomFilter {
  private readonly _bits: Uint8Array;
  readonly sizeBits: number;
  readonly hashCount: number;

  constructor(expectedItems: number, fpRate = 0.01) {
    const n = Math.max(1, expectedItems);
    const m = Math.ceil((-n * Math.log(fpRate)) / (Math.LN2 * Math.LN2));
    this.sizeBits = Math.max(8, m);
    this.hashCount = Math.max(1, Math.round((this.sizeBits / n) * Math.LN2));
    this._bits = new Uint8Array(Math.ceil(this.sizeBits / 8));
  }

  /** Double hashing: h_i(x) = h1(x) + i·h2(x) — two hashes give k probes. */
  private _hash(key: string, seed: number): number {
    let h = seed >>> 0;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h % this.sizeBits;
  }

  add(key: string): void {
    const h1 = this._hash(key, 0x811c9dc5);
    const h2 = this._hash(key, 0xdeadbeef) || 1; // h2 must be nonzero
    for (let i = 0; i < this.hashCount; i++) {
      const bit = (h1 + i * h2) % this.sizeBits;
      this._bits[bit >> 3] |= 1 << (bit & 7);
    }
  }

  mightContain(key: string): boolean {
    const h1 = this._hash(key, 0x811c9dc5);
    const h2 = this._hash(key, 0xdeadbeef) || 1;
    for (let i = 0; i < this.hashCount; i++) {
      const bit = (h1 + i * h2) % this.sizeBits;
      if (!(this._bits[bit >> 3] & (1 << (bit & 7)))) return false;
    }
    return true;
  }
}

/** One WAL record — the crash-recovery trail. */
export interface WalRecord {
  readonly seq: number;
  readonly op: 'put' | 'delete';
  readonly ns: string;
  readonly partition: number;
  readonly key: string;
  readonly value?: StateValue;
}

/**
 * Immutable sorted table: sorted entries + bloom filter + seq range.
 * `value === null` is a tombstone (delete marker).
 */
export class SsTable {
  readonly id: number;
  readonly level: number;
  readonly entries: ReadonlyMap<string, StateValue | null>;
  readonly bloom: BloomFilter;
  readonly minSeq: number;
  readonly maxSeq: number;

  constructor(
    id: number,
    level: number,
    entries: Map<string, StateValue | null>,
    minSeq: number,
    maxSeq: number
  ) {
    this.id = id;
    this.level = level;
    this.entries = entries;
    this.minSeq = minSeq;
    this.maxSeq = maxSeq;
    this.bloom = new BloomFilter(entries.size);
    for (const k of entries.keys()) this.bloom.add(k);
  }

  /**
   * Point lookup: bloom-check first (definite-absent short-circuit),
   * then the map. Returns 'absent' | 'tombstone' | value.
   */
  probe(key: string): { kind: 'absent' } | { kind: 'tombstone' } | { kind: 'value'; value: StateValue } {
    if (!this.bloom.mightContain(key)) return { kind: 'absent' };
    const v = this.entries.get(key);
    if (v === undefined) return { kind: 'absent' };
    if (v === null) return { kind: 'tombstone' };
    return { kind: 'value', value: v };
  }
}

export interface LsmOptions {
  /** Entries per namespace-partition before the memtable flushes. */
  memtableMaxEntries?: number;
  /** SSTables per level before compaction merges them into the next. */
  levelFanout?: number;
  /** Max levels; the bottom level discards tombstones for real. */
  maxLevels?: number;
}

/**
 * LSM-tree backend. Write path: WAL → memtable. Read path: memtable →
 * SSTables newest→oldest, first hit wins (tombstone counts as a hit —
 * it must shadow older values). Flush: sorted memtable → L0 SSTable.
 * Compaction: merge k SSTables of a level into the next; tombstones
 * survive every level except the bottom, where they finally free space.
 */
export class LsmStateBackend implements KeyedStateBackend {
  readonly kind = 'lsm';
  private readonly _memtableMax: number;
  private readonly _fanout: number;
  private readonly _maxLevels: number;
  /** ns -> partition -> mutable sorted map. */
  private readonly _memtables = new Map<string, Map<number, Map<string, StateValue | null>>>();
  /** ns -> partition -> SSTables (index 0 = newest). */
  private readonly _tables = new Map<string, Map<number, SsTable[]>>();
  private readonly _wal: WalRecord[] = [];
  private _nextSeq = 0;
  private _nextTableId = 1;
  private _flushes = 0;
  private _compactions = 0;
  private _bloomSkips = 0;

  constructor(options: LsmOptions = {}) {
    this._memtableMax = Math.max(2, options.memtableMaxEntries ?? 64);
    this._fanout = Math.max(2, options.levelFanout ?? 4);
    this._maxLevels = Math.max(1, options.maxLevels ?? 4);
  }

  registerNamespace(ns: string): void {
    if (!this._memtables.has(ns)) {
      this._memtables.set(ns, new Map());
      this._tables.set(ns, new Map());
    }
  }

  private _mem(ns: string, partition: number): Map<string, StateValue | null> {
    const nsMap = this._memtables.get(ns);
    if (!nsMap) throw new Error(`unknown namespace '${ns}'`);
    let p = nsMap.get(partition);
    if (!p) {
      p = new Map();
      nsMap.set(partition, p);
    }
    return p;
  }

  private _tabs(ns: string, partition: number): SsTable[] {
    const nsMap = this._tables.get(ns);
    if (!nsMap) throw new Error(`unknown namespace '${ns}'`);
    let p = nsMap.get(partition);
    if (!p) {
      p = [];
      nsMap.set(partition, p);
    }
    return p;
  }

  // ------------------------------------------------------------ write

  put(ns: string, partition: number, key: string, value: StateValue): void {
    this._wal.push({ seq: this._nextSeq++, op: 'put', ns, partition, key, value });
    this._mem(ns, partition).set(key, value);
    if (this._mem(ns, partition).size >= this._memtableMax) this.flush(ns, partition);
  }

  delete(ns: string, partition: number, key: string): void {
    this._wal.push({ seq: this._nextSeq++, op: 'delete', ns, partition, key });
    this._mem(ns, partition).set(key, null); // tombstone
    if (this._mem(ns, partition).size >= this._memtableMax) this.flush(ns, partition);
  }

  /**
   * Freeze the memtable into an L0 SSTable (sorted + bloom) and clear.
   * The WAL is NOT truncated here — it only becomes dead once every
   * covered table has flushed (tracked by callers via `walLength`).
   */
  flush(ns: string, partition: number): SsTable | null {
    const mem = this._memtables.get(ns)?.get(partition);
    if (!mem || mem.size === 0) return null;
    const sorted = new Map([...mem.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
    const table = new SsTable(this._nextTableId++, 0, sorted, 0, this._nextSeq - 1);
    this._tabs(ns, partition).unshift(table);
    mem.clear();
    this._flushes++;
    this._maybeCompact(ns, partition);
    return table;
  }

  /**
   * Merge the `fanout` oldest SSTables of the shallowest overfull level
   * into the next level. Newest-wins conflict resolution; tombstones are
   * dropped only when compacting INTO the bottom level — anywhere above
   * bottom they still need to shadow older data.
   */
  private _maybeCompact(ns: string, partition: number): void {
    const tables = this._tabs(ns, partition);
    for (let level = 0; level < this._maxLevels; level++) {
      const atLevel = tables.filter((t) => t.level === level);
      if (atLevel.length < this._fanout) return;
      const merging = atLevel.slice(-this._fanout); // oldest k
      const merged = new Map<string, StateValue | null>();
      // Iterate oldest→newest so newer overwrites older.
      for (const t of [...merging].reverse()) {
        for (const [k, v] of t.entries) merged.set(k, v);
      }
      const intoBottom = level + 1 >= this._maxLevels;
      if (intoBottom) {
        for (const [k, v] of [...merged]) if (v === null) merged.delete(k);
      }
      const minSeq = Math.min(...merging.map((t) => t.minSeq));
      const maxSeq = Math.max(...merging.map((t) => t.maxSeq));
      const out = new SsTable(this._nextTableId++, level + 1, merged, minSeq, maxSeq);
      const remaining = tables.filter((t) => !merging.includes(t));
      remaining.push(out);
      // Keep newest-first ordering by (level, id desc).
      remaining.sort((a, b) => a.level - b.level || b.id - a.id);
      this._tables.get(ns)!.set(partition, remaining);
      this._compactions++;
      // Recurse: the new table may overfill the next level.
      this._maybeCompact(ns, partition);
      return;
    }
  }

  // ------------------------------------------------------------- read

  /**
   * Read path fidelity: memtable first (newest data), then SSTables
   * newest→oldest. A tombstone hit returns undefined — the key is
   * deleted, NOT absent, so we must NOT fall through to older tables.
   */
  get(ns: string, partition: number, key: string): StateValue | undefined {
    if (!this._memtables.has(ns)) throw new Error(`unknown namespace '${ns}'`);
    const mem = this._memtables.get(ns)?.get(partition);
    if (mem) {
      const v = mem.get(key);
      if (v !== undefined) return v === null ? undefined : v;
    }
    for (const t of this._tables.get(ns)?.get(partition) ?? []) {
      if (!t.bloom.mightContain(key)) {
        this._bloomSkips++;
        continue;
      }
      const probe = t.probe(key);
      if (probe.kind === 'value') return probe.value;
      if (probe.kind === 'tombstone') return undefined;
    }
    return undefined;
  }

  entries(ns: string, partition: number): [string, StateValue][] {
    if (!this._memtables.has(ns)) throw new Error(`unknown namespace '${ns}'`);
    // Merge all levels newest-first; later (older) entries can't override.
    const acc = new Map<string, StateValue | null>();
    const mem = this._memtables.get(ns)?.get(partition);
    if (mem) for (const [k, v] of mem) acc.set(k, v);
    for (const t of this._tables.get(ns)?.get(partition) ?? []) {
      for (const [k, v] of t.entries) {
        if (!acc.has(k)) acc.set(k, v);
      }
    }
    const out: [string, StateValue][] = [];
    for (const [k, v] of acc) {
      if (v !== null) out.push([k, v]);
    }
    return out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  }

  count(ns: string, partition: number): number {
    return this.entries(ns, partition).length;
  }

  snapshot(ns: string): BackendSnapshot {
    if (!this._memtables.has(ns)) throw new Error(`unknown namespace '${ns}'`);
    const entries: BackendSnapshot['entries'] = [];
    for (const p of this.partitions(ns)) {
      for (const [key, value] of this.entries(ns, p)) {
        entries.push({ partition: p, key, value });
      }
    }
    return { namespace: ns, entries };
  }

  restore(ns: string, snap: BackendSnapshot): void {
    this.registerNamespace(ns);
    for (const e of snap.entries) {
      this._mem(ns, e.partition).set(e.key, e.value);
    }
    // Don't auto-flush: restores may feed thousands of keys; the caller
    // (StateMigrator) flushes explicitly when it wants durable images.
  }

  partitions(ns: string): number[] {
    if (!this._memtables.has(ns)) throw new Error(`unknown namespace '${ns}'`);
    const out = new Set<number>();
    for (const p of this._memtables.get(ns)?.keys() ?? []) out.add(p);
    for (const p of this._tables.get(ns)?.keys() ?? []) out.add(p);
    return [...out].sort((a, b) => a - b);
  }

  dropNamespace(ns: string): void {
    this._memtables.delete(ns);
    this._tables.delete(ns);
  }

  // ------------------------------------------------------- diagnostics

  /** WAL records since start (crash-recovery input). */
  wal(): readonly WalRecord[] {
    return this._wal;
  }

  walLength(): number {
    return this._wal.length;
  }

  /** Replay the WAL from `fromSeq` — rebuilds memtables after a crash. */
  recover(fromSeq = 0): void {
    for (const r of this._wal) {
      if (r.seq < fromSeq) continue;
      if (r.op === 'put' && r.value !== undefined) {
        this._mem(r.ns, r.partition).set(r.key, r.value);
      } else if (r.op === 'delete') {
        this._mem(r.ns, r.partition).set(r.key, null);
      }
    }
  }

  get flushCount(): number {
    return this._flushes;
  }

  get compactionCount(): number {
    return this._compactions;
  }

  /** Reads that skipped an SSTable thanks to the bloom filter. */
  get bloomSkips(): number {
    return this._bloomSkips;
  }

  /** SSTables per (ns, partition) — compaction observability. */
  tableCounts(ns: string): Map<number, number> {
    const out = new Map<number, number>();
    for (const [p, tabs] of this._tables.get(ns) ?? []) out.set(p, tabs.length);
    return out;
  }
}
