/**
 * SnapshotManager — full + incremental snapshot chains over a VersionMap.
 *
 * Snapshot types:
 *   - FULL:        captures every live key's (version, value, hash) — the
 *                  baseline for a chain.
 *   - INCREMENTAL: captures only blocks whose content changed relative to
 *                  the parent snapshot. Restores by walking the chain.
 *
 * Block model: the keyspace is partitioned into fixed buckets by hashing
 * the key. Each snapshot stores, per bucket, either a full block
 * (key → value) or just a diff (changed keys only). The per-block hash
 * enables the HashTree integrity check: a snapshot's root covers every
 * block in the chain reachable through deltas.
 *
 * Restore:
 *   - `restore(id)` — materialize a map as of the snapshot's version
 *   - `restoreIncremental(id)` — walk the chain applying deltas
 *
 * The manager also supports:
 *   - `verify(id)` — recompute block hashes, compare to stored Merkle root
 *   - `chainOf(id)` — list of ancestors (for retention + debugging)
 *
 * @module SnapshotLayer/Implementations
 */

import { VersionMap } from './VersionMap';
import { HashTree, hashBlock, type HashFn, fnv1a64 } from './HashTree';

// ------------------------------------------------------------------ types

export type SnapshotKind = 'full' | 'incremental';

/** One bucket's worth of key→value data in a snapshot. */
export interface SnapshotBlock {
  readonly bucketIndex: number;
  /** key → serialized value (full block) or changed-keys only (delta). */
  readonly entries: Record<string, string>;
  /** Hash of the block contents. */
  readonly hash: string;
}

/** A stored snapshot. */
export interface StoredSnapshot {
  readonly id: string;
  readonly kind: SnapshotKind;
  /** Parent snapshot id for incremental chains (undefined for full). */
  readonly parentId?: string;
  /** VersionMap version at capture time. */
  readonly version: number;
  /** Wall-clock capture time. */
  readonly takenAt: number;
  /** Fixed bucket count for this chain. */
  readonly bucketCount: number;
  /** Per-bucket block data — full content for FULL, deltas for INCR. */
  readonly blocks: SnapshotBlock[];
  /** Merkle root over block hashes. */
  readonly rootHash: string;
  /** Labels — used by retention policies (e.g. 'daily', 'weekly'). */
  readonly labels: Set<string>;
}

/** Options for `take()`. */
export interface TakeOptions {
  /** 'incremental' requires an existing snapshot in the chain. */
  readonly kind?: SnapshotKind;
  /** Parent id — defaults to the most recent snapshot. */
  readonly parentId?: string;
  /** Labels for retention. */
  readonly labels?: string[];
  /** Bucket count — only meaningful for 'full'. */
  readonly bucketCount?: number;
}

export class SnapshotNotFoundError extends Error {
  constructor(id: string) {
    super(`Snapshot '${id}' not found`);
    this.name = 'SnapshotNotFoundError';
  }
}

export class SnapshotIntegrityError extends Error {
  readonly snapshotId: string;
  constructor(id: string, detail: string) {
    super(`Integrity check failed on snapshot '${id}': ${detail}`);
    this.name = 'SnapshotIntegrityError';
    this.snapshotId = id;
  }
}

// ------------------------------------------------------------------ manager

let _snapCounter = 0;
function nextSnapshotId(): string {
  _snapCounter += 1;
  return `snap-${Date.now().toString(36)}-${_snapCounter.toString(36)}`;
}

/** Deterministic bucket assignment — FNV over the key. */
function bucketFor(key: string, bucketCount: number, hashFn: HashFn): number {
  const h = hashFn(key);
  // Take low bits — last 8 hex chars → int.
  const n = parseInt(h.slice(-8), 16);
  return n % bucketCount;
}

/** Serialize a value for storage — JSON with stable key order. */
function serialize(v: unknown): string {
  return JSON.stringify(v, (_k, x) => {
    if (x !== null && typeof x === 'object' && !Array.isArray(x)) {
      const rec = x as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const kk of Object.keys(rec).sort()) out[kk] = rec[kk];
      return out;
    }
    return x;
  });
}

/** Deserialize — inverse of serialize. */
function deserialize(s: string): unknown {
  return JSON.parse(s) as unknown;
}

export class SnapshotManager {
  private readonly _map: VersionMap;
  private readonly _snapshots = new Map<string, StoredSnapshot>();
  private readonly _hashFn: HashFn;

  constructor(map: VersionMap, hashFn: HashFn = fnv1a64) {
    this._map = map;
    this._hashFn = hashFn;
  }

  /** List snapshots oldest→newest. */
  list(): StoredSnapshot[] {
    return [...this._snapshots.values()].sort((a, b) => a.takenAt - b.takenAt);
  }

  /** Fetch a snapshot by id. */
  get(id: string): StoredSnapshot {
    const s = this._snapshots.get(id);
    if (!s) throw new SnapshotNotFoundError(id);
    return s;
  }

  /** Whether a snapshot exists. */
  has(id: string): boolean {
    return this._snapshots.has(id);
  }

  /** Drop a snapshot. Its incremental children become unresolvable —
   *  callers should collapse the chain first (see `flatten`). */
  delete(id: string): boolean {
    return this._snapshots.delete(id);
  }

  /**
   * Take a snapshot.
   *
   * FULL: materializes every live key at `map.currentVersion`.
   * INCREMENTAL: diffs against `parentId` (or the latest snapshot) —
   * records only buckets whose content changed.
   */
  take(options: TakeOptions = {}): StoredSnapshot {
    const kind = options.kind ?? 'full';
    const version = this._map.currentVersion;
    const bucketCount = options.bucketCount ?? 16;

    if (kind === 'full') {
      const snap = this._takeFull(version, bucketCount, options.labels ?? []);
      this._snapshots.set(snap.id, snap);
      return snap;
    }

    // Incremental — resolve parent.
    const parentId = options.parentId ?? this.list().at(-1)?.id;
    if (!parentId) {
      throw new Error('Incremental snapshot requires an existing parent');
    }
    const parent = this.get(parentId);
    const snap = this._takeIncremental(version, parent, options.labels ?? []);
    this._snapshots.set(snap.id, snap);
    return snap;
  }

  // -------------------------------------------------------------- restore

  /**
   * Restore the full map state at a snapshot. For incremental snapshots
   * walks the parent chain to assemble complete state.
   */
  restore(id: string): Map<string, unknown> {
    const snap = this.get(id);
    const chain = this.chainOf(id);
    // Materialize from the oldest full snapshot forward.
    const state = new Map<string, unknown>();
    for (const s of chain) {
      for (const block of s.blocks) {
        for (const [k, v] of Object.entries(block.entries)) {
          if (v === '__deleted__') {
            state.delete(k);
          } else {
            state.set(k, deserialize(v));
          }
        }
      }
    }
    // Sanity: for a full snapshot, the chain is just [snap] — state is
    // exactly the materialized map. For incremental we walked up.
    void snap;
    return state;
  }

  /**
   * Point-in-time restore bypassing snapshot data — queries the
   * VersionMap directly at `version`. Serves as an oracle for testing
   * snapshot correctness.
   */
  restorePointInTime(version: number): Map<string, unknown> {
    return this._map.materializeAt(version);
  }

  /** Snapshot ids from root → target (inclusive). */
  chainOf(id: string): StoredSnapshot[] {
    const chain: StoredSnapshot[] = [];
    let cur: StoredSnapshot | undefined = this.get(id);
    while (cur) {
      chain.unshift(cur);
      cur = cur.parentId ? this._snapshots.get(cur.parentId) : undefined;
    }
    return chain;
  }

  /** Children of a snapshot — snapshots that reference it as parent. */
  childrenOf(id: string): StoredSnapshot[] {
    return [...this._snapshots.values()].filter((s) => s.parentId === id);
  }

  // -------------------------------------------------------------- verify

  /**
   * Recompute each block's hash and the tree root; throw if they don't
   * match the stored values. O(total snapshot data).
   */
  verify(id: string): void {
    const snap = this.get(id);
    const recomputed = snap.blocks.map((b) => this._blockHash(b));
    const tree = new HashTree(recomputed, this._hashFn);
    if (tree.root !== snap.rootHash) {
      throw new SnapshotIntegrityError(
        id,
        `root mismatch: expected ${snap.rootHash}, computed ${tree.root}`,
      );
    }
  }

  /**
   * Structural comparison: does `restore(id)` equal `restorePointInTime(
   * snap.version)`? The expensive correctness check used by tests and
   * background scrubbing.
   */
  verifyAgainstLive(id: string): boolean {
    const snap = this.get(id);
    const a = this.restore(id);
    const b = this.restorePointInTime(snap.version);
    if (a.size !== b.size) return false;
    for (const [k, v] of a) {
      if (!b.has(k)) return false;
      if (serialize(b.get(k)) !== serialize(v)) return false;
    }
    return true;
  }

  // ------------------------------------------------------------- internal

  private _bucketize(
    entries: Map<string, string>,
    bucketCount: number,
  ): SnapshotBlock[] {
    const buckets: Record<string, string>[] = [];
    for (let i = 0; i < bucketCount; i++) buckets.push({});
    for (const [k, v] of entries) {
      const b = bucketFor(k, bucketCount, this._hashFn);
      buckets[b]![k] = v;
    }
    return buckets.map((entries, i) => {
      const block: SnapshotBlock = {
        bucketIndex: i,
        entries,
        hash: '',
      };
      return { ...block, hash: this._blockHash(block) };
    });
  }

  private _blockHash(block: SnapshotBlock): string {
    // Hash block contents deterministically: bucket index + sorted entries.
    const keys = Object.keys(block.entries).sort();
    const body = keys.map((k) => `${k}=${block.entries[k]}`).join(';');
    return hashBlock(`b${block.bucketIndex}`, body, this._hashFn);
  }

  private _takeFull(
    version: number,
    bucketCount: number,
    labels: string[],
  ): StoredSnapshot {
    const live = this._map.materializeAt(version);
    const serialized = new Map<string, string>();
    for (const [k, v] of live) serialized.set(k, serialize(v));
    const blocks = this._bucketize(serialized, bucketCount);
    const tree = new HashTree(blocks.map((b) => b.hash), this._hashFn);
    return {
      id: nextSnapshotId(),
      kind: 'full',
      version,
      takenAt: Date.now(),
      bucketCount,
      blocks,
      rootHash: tree.root,
      labels: new Set(labels),
    };
  }

  private _takeIncremental(
    version: number,
    parent: StoredSnapshot,
    labels: string[],
  ): StoredSnapshot {
    // Materialize parent's state, diff against live state.
    const parentState = this.restore(parent.id);
    const live = this._map.materializeAt(version);

    const deltas = new Map<string, string>();
    // Changed or added keys.
    for (const [k, v] of live) {
      const serialized = serialize(v);
      const prev = parentState.get(k);
      if (prev === undefined || serialize(prev) !== serialized) {
        deltas.set(k, serialized);
      }
    }
    // Deleted keys — present in parent, gone now.
    for (const k of parentState.keys()) {
      if (!live.has(k)) {
        deltas.set(k, '__deleted__');
      }
    }

    const blocks = this._bucketize(deltas, parent.bucketCount);
    const tree = new HashTree(blocks.map((b) => b.hash), this._hashFn);
    return {
      id: nextSnapshotId(),
      kind: 'incremental',
      parentId: parent.id,
      version,
      takenAt: Date.now(),
      bucketCount: parent.bucketCount,
      blocks,
      rootHash: tree.root,
      labels: new Set(labels),
    };
  }

  /**
   * Collapse a chain: convert an incremental snapshot into a full one
   * (materializes + rewrites blocks), then drops all its ancestors.
   * Used by retention policies when they want to keep a recent point
   * but discard history.
   */
  flatten(id: string): StoredSnapshot {
    const snap = this.get(id);
    const state = this.restore(id);
    const serialized = new Map<string, string>();
    for (const [k, v] of state) serialized.set(k, serialize(v));
    const blocks = this._bucketize(serialized, snap.bucketCount);
    const tree = new HashTree(blocks.map((b) => b.hash), this._hashFn);
    const flat: StoredSnapshot = {
      ...snap,
      kind: 'full',
      parentId: undefined,
      blocks,
      rootHash: tree.root,
    };
    this._snapshots.set(id, flat);
    return flat;
  }

  /** Total block count across snapshots — storage metric. */
  get totalBlocks(): number {
    let n = 0;
    for (const s of this._snapshots.values()) n += s.blocks.length;
    return n;
  }
}
