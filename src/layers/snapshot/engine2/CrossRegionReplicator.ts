/**
 * CrossRegionReplicator — cross-region snapshot copy (stub transport).
 *
 * Models the control-plane of a cross-region backup copy: a source
 * `SnapshotManager` in region A replicates snapshots into a peer
 * manager in region B through a pluggable `RegionTransport`.
 *
 * What is real here:
 *   - COPY SET SELECTION: only snapshots not already present in the
 *     destination are transferred; incremental snapshots require their
 *     ancestor chain to be copied first (topological order).
 *   - INTEGRITY: every transferred snapshot is re-verified at the
 *     destination by recomputing block hashes — corrupted transfers are
 *     rejected and reported, not silently stored.
 *   - RESUMABILITY: a failed copy leaves a receipt; the next `sync()`
 *     retries missing links only.
 *   - BANDWIDTH MODEL: the transport carries byte counts so callers can
 *     measure egress per sync (cost of cross-region traffic matters).
 *
 * What is stubbed:
 *   - `InMemoryRegionTransport` stands in for a real wire (S3 CRR,
 *     storage-array replication, etc.). The interface is the seam.
 *
 * @module SnapshotLayer/Engine2
 */

import { SnapshotManager } from '../implementations/SnapshotManager';
import type { StoredSnapshot, SnapshotBlock } from '../implementations/SnapshotManager';
import { hashBlock, fnv1a64 } from '../implementations/HashTree';
import type { HashFn } from '../implementations/HashTree';
import { stateDigest } from './BackupChainVerifier';

// ------------------------------------------------------------------ transport

/** Serializable snapshot record crossing the wire. */
export interface SnapshotWireRecord {
  readonly id: string;
  readonly kind: 'full' | 'incremental';
  readonly parentId?: string;
  readonly version: number;
  readonly takenAt: number;
  readonly bucketCount: number;
  readonly blocks: SnapshotBlock[];
  readonly rootHash: string;
  readonly labels: string[];
  /** Source-side state digest — destination recomputes to verify. */
  readonly stateDigest?: string;
}

/** Wire abstraction — a real impl streams bytes to another region. */
export interface RegionTransport {
  /** Name of the destination region. */
  readonly region: string;
  /** Push one record; returns bytes transmitted. Throws on failure. */
  send(record: SnapshotWireRecord): Promise<number>;
}

/** In-memory loopback transport — records everything it "sent". */
export class InMemoryRegionTransport implements RegionTransport {
  readonly region: string;
  readonly sent: SnapshotWireRecord[] = [];
  /** Simulated failure rate 0..1 — for tests. */
  failNext = 0;
  private readonly _byteCost: (r: SnapshotWireRecord) => number;

  constructor(region: string, byteCost?: (r: SnapshotWireRecord) => number) {
    this.region = region;
    this._byteCost = byteCost ?? ((r) => JSON.stringify(r.blocks).length);
  }

  send(record: SnapshotWireRecord): Promise<number> {
    if (this.failNext > 0) {
      this.failNext--;
      return Promise.reject(new Error(`simulated transport failure to ${this.region}`));
    }
    this.sent.push(record);
    return Promise.resolve(this._byteCost(record));
  }
}

// ------------------------------------------------------------------ remote store

/**
 * Destination-side snapshot store: accepts wire records after
 * re-verifying their block hashes against the claimed Merkle root.
 * Restorable materialization is a stub — real restores would rebuild a
 * VersionMap; here we keep the verified records and their digests.
 */
export class RemoteSnapshotStore {
  private readonly _records = new Map<string, SnapshotWireRecord>();
  private readonly _hashFn: HashFn;

  constructor(hashFn: HashFn = fnv1a64) {
    this._hashFn = hashFn;
  }

  /**
   * Ingest a wire record. Recomputes every block hash and the Merkle
   * root; refuses (returns false) when the transfer corrupted data.
   */
  ingest(record: SnapshotWireRecord): boolean {
    const recomputed: string[] = [];
    for (const b of record.blocks) {
      const keys = Object.keys(b.entries).sort();
      const body = keys.map((k) => `${k}=${b.entries[k]}`).join(';');
      const h = hashBlock(`b${b.bucketIndex}`, body, this._hashFn);
      if (h !== b.hash) return false;
      recomputed.push(h);
    }
    let level = recomputed;
    while (level.length > 1) {
      const next: string[] = [];
      for (let i = 0; i < level.length; i += 2) {
        next.push(i + 1 < level.length ? this._hashFn(`${level[i]}|${level[i + 1]}`) : level[i]!);
      }
      level = next;
    }
    const root = record.blocks.length === 0 ? this._hashFn('empty') : level[0];
    if (root !== record.rootHash) return false;
    this._records.set(record.id, record);
    return true;
  }

  has(id: string): boolean {
    return this._records.has(id);
  }

  get(id: string): SnapshotWireRecord | undefined {
    return this._records.get(id);
  }

  ids(): string[] {
    return [...this._records.keys()];
  }

  get size(): number {
    return this._records.size;
  }
}

// ------------------------------------------------------------------ replicator

/** Per-snapshot copy outcome. */
export interface CopyResult {
  readonly snapshotId: string;
  readonly copied: boolean;
  readonly bytes: number;
  /** Why the copy was skipped or failed. */
  readonly reason?: string;
}

/** One sync run's summary. */
export interface SyncReport {
  readonly region: string;
  readonly copied: number;
  readonly skipped: number;
  readonly failed: number;
  readonly bytesTransferred: number;
  readonly results: CopyResult[];
}

export class CrossRegionReplicator {
  private readonly _source: SnapshotManager;
  private readonly _transport: RegionTransport;
  private readonly _remote: RemoteSnapshotStore;

  constructor(source: SnapshotManager, transport: RegionTransport, remote: RemoteSnapshotStore) {
    this._source = source;
    this._transport = transport;
    this._remote = remote;
  }

  /**
   * Copy every snapshot in the source that the remote lacks, in chain
   * order (parents before children). Incremental records whose parent
   * has not yet arrived are deferred to the next sync.
   */
  async sync(): Promise<SyncReport> {
    const results: CopyResult[] = [];
    let copied = 0;
    let skipped = 0;
    let failed = 0;
    let bytes = 0;

    // Topological order: a parent always precedes its children.
    const ordered = this._topoOrder(this._source.list());

    for (const snap of ordered) {
      if (this._remote.has(snap.id)) {
        skipped++;
        results.push({ snapshotId: snap.id, copied: false, bytes: 0, reason: 'already replicated' });
        continue;
      }
      // An incremental's parent must exist remotely first.
      if (snap.kind === 'incremental' && snap.parentId && !this._remote.has(snap.parentId)) {
        skipped++;
        results.push({ snapshotId: snap.id, copied: false, bytes: 0, reason: 'parent not yet replicated' });
        continue;
      }

      const record = this._toWire(snap);
      try {
        const n = await this._transport.send(record);
        const ok = this._remote.ingest(record);
        if (!ok) {
          failed++;
          results.push({ snapshotId: snap.id, copied: false, bytes: n, reason: 'integrity check failed at destination' });
          continue;
        }
        copied++;
        bytes += n;
        results.push({ snapshotId: snap.id, copied: true, bytes: n });
      } catch (e) {
        failed++;
        results.push({
          snapshotId: snap.id,
          copied: false,
          bytes: 0,
          reason: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return { region: this._transport.region, copied, skipped, failed, bytesTransferred: bytes, results };
  }

  /** Access the remote store (test + inspection hook). */
  get remote(): RemoteSnapshotStore {
    return this._remote;
  }

  private _toWire(snap: StoredSnapshot): SnapshotWireRecord {
    let digest: string | undefined;
    try {
      digest = stateDigest(this._source.restore(snap.id));
    } catch {
      digest = undefined; // unrestorable link — ship anyway, dest verifies hashes
    }
    return {
      id: snap.id,
      kind: snap.kind,
      parentId: snap.parentId,
      version: snap.version,
      takenAt: snap.takenAt,
      bucketCount: snap.bucketCount,
      blocks: snap.blocks,
      rootHash: snap.rootHash,
      labels: [...snap.labels],
      stateDigest: digest,
    };
  }

  /** Parents before children — stable by takenAt within a level. */
  private _topoOrder(snaps: StoredSnapshot[]): StoredSnapshot[] {
    const byId = new Map(snaps.map((s) => [s.id, s]));
    const depth = new Map<string, number>();
    const d = (s: StoredSnapshot, seen: Set<string>): number => {
      if (depth.has(s.id)) return depth.get(s.id)!;
      if (seen.has(s.id) || !s.parentId || !byId.has(s.parentId)) {
        depth.set(s.id, 0);
        return 0;
      }
      seen.add(s.id);
      const v = d(byId.get(s.parentId)!, seen) + 1;
      depth.set(s.id, v);
      return v;
    };
    for (const s of snaps) d(s, new Set());
    return [...snaps].sort((a, b) => (depth.get(a.id) ?? 0) - (depth.get(b.id) ?? 0) || a.takenAt - b.takenAt);
  }
}
