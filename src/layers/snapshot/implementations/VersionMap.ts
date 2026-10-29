/**
 * VersionMap — copy-on-write key/value store with versioned visibility.
 *
 * Models the underlying "volume" that snapshots capture. Each write bumps
 * a per-key version; each key keeps a history of `(version, value)` pairs
 * so a snapshot taken at version V sees the state of every key as of its
 * last write <= V.
 *
 * Data structure: `Map<key, Array<{version, value}>>` — append-only
 * version chains per key. Lookup at version V is a binary search —
 * O(log h) where h = history length for that key. For the typical
 * snapshot workload (many reads at the latest version) we short-circuit
 * via a `latest` cache.
 *
 * A global `currentVersion` ticks on every write — snapshots record the
 * version they were taken at and query keys at that point.
 *
 * This is a *stub* for a real copy-on-write volume (which would page in
 * 4KiB blocks and share pages between snapshots); the semantics are
 * preserved: writes never modify history, reads at a version are stable.
 *
 * @module SnapshotLayer/Implementations
 */

// ------------------------------------------------------------------ types

/** One entry in a key's version chain. */
interface VersionedValue {
  readonly version: number;
  readonly value: unknown;
}

/** A key's full history — sorted by version ascending. */
type History = VersionedValue[];

/** A point-in-time view of a key. */
export interface VersionedRead {
  readonly key: string;
  readonly version: number;
  readonly value: unknown;
  /** Whether the key existed at that version. */
  readonly exists: boolean;
}

// ------------------------------------------------------------------ store

export class VersionMap {
  private readonly _histories = new Map<string, History>();
  private _currentVersion = 0;
  /** Total writes since creation — diagnostics. */
  private _writeCount = 0;

  /** Current global version — bumped on every mutation. */
  get currentVersion(): number {
    return this._currentVersion;
  }

  /** Total mutations applied. */
  get writeCount(): number {
    return this._writeCount;
  }

  /**
   * Write a value — bumps the global version and appends to the key's
   * history. Returns the new global version.
   */
  set(key: string, value: unknown): number {
    this._currentVersion += 1;
    this._writeCount += 1;
    let h = this._histories.get(key);
    if (!h) {
      h = [];
      this._histories.set(key, h);
    }
    h.push({ version: this._currentVersion, value });
    return this._currentVersion;
  }

  /**
   * Delete a key — appends a tombstone (value = undefined marker is
   * ambiguous, so we use a sentinel object internally).
   */
  delete(key: string): number {
    this._currentVersion += 1;
    this._writeCount += 1;
    let h = this._histories.get(key);
    if (!h) {
      h = [];
      this._histories.set(key, h);
    }
    h.push({ version: this._currentVersion, value: TOMBSTONE });
    return this._currentVersion;
  }

  /** Read the latest value. */
  get(key: string): unknown {
    return this.getAt(key, this._currentVersion).value;
  }

  /** Whether a key exists (has a non-tombstone latest value). */
  has(key: string): boolean {
    return this.getAt(key, this._currentVersion).exists;
  }

  /**
   * Read a key as of `version`. Binary search over the key's history —
   * returns the last entry with `entry.version <= version`.
   */
  getAt(key: string, version: number): VersionedRead {
    const h = this._histories.get(key);
    if (!h || h.length === 0) {
      return { key, version, value: undefined, exists: false };
    }
    // Binary search: find last entry with version <= v.
    let lo = 0;
    let hi = h.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const e = h[mid]!;
      if (e.version <= version) lo = mid + 1;
      else hi = mid;
    }
    const idx = lo - 1;
    if (idx < 0) return { key, version, value: undefined, exists: false };
    const e = h[idx]!;
    if (e.value === TOMBSTONE) {
      return { key, version, value: undefined, exists: false };
    }
    return { key, version: e.version, value: e.value, exists: true };
  }

  /**
   * Materialize the full map at `version` — iterates all keys and
   * resolves each one. O(k log h) where k = key count.
   */
  materializeAt(version: number): Map<string, unknown> {
    const out = new Map<string, unknown>();
    for (const key of this._histories.keys()) {
      const r = this.getAt(key, version);
      if (r.exists) out.set(key, r.value);
    }
    return out;
  }

  /** All keys ever written (including deleted). */
  keys(): string[] {
    return [...this._histories.keys()];
  }

  /** Keys live at the current version. */
  liveKeys(): string[] {
    const out: string[] = [];
    for (const key of this._histories.keys()) {
      if (this.getAt(key, this._currentVersion).exists) out.push(key);
    }
    return out;
  }

  /**
   * Compact history: drop entries at versions <= `belowVersion` that are
   * shadowed by a later entry <= `belowVersion`. Keeps at least the most
   * recent entry <= `belowVersion` (the one a snapshot at that version
   * would still see). This is what real snapshot systems do when
   * collapsing a chain.
   */
  compact(belowVersion: number): number {
    let dropped = 0;
    for (const [key, h] of this._histories) {
      // Find the index of the last entry <= belowVersion.
      let keepFrom = 0;
      for (let i = 0; i < h.length; i++) {
        if (h[i]!.version <= belowVersion) keepFrom = i;
        else break;
      }
      if (keepFrom > 0) {
        // Drop h[0..keepFrom-1] — all shadowed by h[keepFrom].
        dropped += keepFrom;
        this._histories.set(key, h.slice(keepFrom));
      }
    }
    return dropped;
  }

  /** Number of versioned entries across all keys (storage size metric). */
  get historySize(): number {
    let n = 0;
    for (const h of this._histories.values()) n += h.length;
    return n;
  }
}

/** Internal sentinel for deleted keys — distinct from user `undefined`. */
const TOMBSTONE: unique symbol = Symbol('snapshot.tombstone');
