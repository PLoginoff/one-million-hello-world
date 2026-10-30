/**
 * Cross-Region Replication Stub
 *
 * Async replication of backup blocks between two `BlockStorageEngine`
 * instances (a "source region" and a "replica region"), with lag
 * tracking and resumable catch-up.
 *
 * `sync` drains a replication queue — real deployments would stream
 * over the network with retries; the stub models the same semantics
 * in-process so tests can assert lag, ordering, and resumption.
 *
 * Lag is measured two ways: block count behind, and wall-clock lag —
 * the age of the oldest un-replicated block by enqueue time.
 *
 * @module BackupLayer/Engine2
 */

import type { BlockStorageEngine } from '../engines/BlockStorageEngine';
import type { StoredBlock } from '../engines/types';
import type { IClock, TestClock } from '../engines/types';

interface QueuedBlock {
  readonly hash: string;
  readonly enqueuedAt: number;
}

export interface ReplicationLag {
  /** Blocks still queued. */
  readonly blocksBehind: number;
  /** Bytes still queued. */
  readonly bytesBehind: number;
  /** ms since the oldest queued block was enqueued (0 when caught up). */
  readonly wallClockLagMs: number;
  readonly lastSyncAt: number;
}

export interface ReplicationResult {
  readonly replicated: number;
  readonly bytes: number;
  /** Blocks skipped because they already existed at the replica. */
  readonly deduplicated: number;
}

export class CrossRegionReplicator {
  private readonly _source: BlockStorageEngine;
  private readonly _replica: BlockStorageEngine;
  private readonly _clock: IClock;
  private _queue: QueuedBlock[] = [];
  private _lastSyncAt = 0;

  constructor(source: BlockStorageEngine, replica: BlockStorageEngine, clock: IClock) {
    this._source = source;
    this._replica = replica;
    this._clock = clock;
  }

  /**
   * Enqueue every block in `hashes` for replication. Real systems hook
   * this to the backup executor's write path.
   */
  enqueue(hashes: readonly string[]): void {
    const now = this._clock.now();
    for (const h of hashes) {
      this._queue.push({ hash: h, enqueuedAt: now });
    }
  }

  /**
   * Drain up to `maxBlocks` queued blocks to the replica, in enqueue
   * order (FIFO preserves causal order for dependent restore points).
   * Returns what moved this round — partial syncs leave the queue
   * intact for resumption.
   */
  sync(maxBlocks = Number.POSITIVE_INFINITY): ReplicationResult {
    const toMove = this._queue.slice(0, maxBlocks);
    let replicated = 0;
    let bytes = 0;
    let deduped = 0;

    for (const q of toMove) {
      const block = this._source.get(q.hash);
      if (block === null) {
        // Source lost it — nothing to replicate; drop from queue.
        continue;
      }
      if (this._replica.get(q.hash) !== null) {
        deduped++;
        continue;
      }
      this._replica.put(cloneBlock(block));
      replicated++;
      bytes += block.size;
    }

    this._queue = this._queue.slice(toMove.length);
    this._lastSyncAt = this._clock.now();
    return { replicated, bytes, deduplicated: deduped };
  }

  /**
   * Enqueue all hashes in `candidates` that the replica lacks — a
   * "heal the replica" pass. Callers supply the candidate set (from a
   * manifest walk); returns how many were queued.
   */
  enqueueMissing(candidates: readonly string[]): number {
    let added = 0;
    for (const hash of candidates) {
      if (this._replica.get(hash) === null) {
        this.enqueue([hash]);
        added++;
      }
    }
    return added;
  }

  lag(): ReplicationLag {
    let bytes = 0;
    for (const q of this._queue) {
      const b = this._source.get(q.hash);
      if (b) bytes += b.size;
    }
    const oldest = this._queue.length > 0 ? this._queue[0].enqueuedAt : this._clock.now();
    return {
      blocksBehind: this._queue.length,
      bytesBehind: bytes,
      wallClockLagMs: this._queue.length === 0 ? 0 : this._clock.now() - oldest,
      lastSyncAt: this._lastSyncAt,
    };
  }

  get queueDepth(): number {
    return this._queue.length;
  }
}

function cloneBlock(b: StoredBlock): StoredBlock {
  return {
    hash: b.hash,
    data: Buffer.from(b.data),
    size: b.size,
    encrypted: b.encrypted,
    nonce: b.nonce === null ? null : Buffer.from(b.nonce),
    authTag: b.authTag === null ? null : Buffer.from(b.authTag),
  };
}
