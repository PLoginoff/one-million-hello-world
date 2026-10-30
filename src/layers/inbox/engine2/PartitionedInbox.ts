/**
 * PartitionedInbox — parallel processing lanes keyed by message key.
 *
 * Inbox consumers frequently need ordering per ENTITY (per customer,
 * per order) but want parallelism ACROSS entities. The classic answer
 * is key-partitioning: hash the message key to one of N partitions,
 * process each partition serially, process partitions in parallel.
 *
 * Design:
 *   - each partition owns a dedicated `InboxEngine` — full dedup/retry/
 *     parking semantics per partition, no cross-partition coupling
 *   - `receive(consumer, key, ...)` hashes the key (FNV-1a, consistent
 *     with the codebase) to a partition; same key → same partition →
 *     serialized processing for that key
 *   - `processPartition(i, handler)` drains one partition serially
 *   - `processAll(handler)` fans out across partitions in parallel
 *     (Promise.all) — wall-clock speedup equals partition count
 *
 * Partitioning is stable for a given partition count; changing the
 * count reshuffles keys (same caveat as Kafka partition changes).
 *
 * @module Inbox/Engine2
 */

import { InboxEngine } from '../pattern/InboxEngine';
import type { InboxEngineConfig, MessageHandler, ReceiveResult } from '../pattern/types';

/** FNV-1a 64-bit — fast key hashing for partition assignment. */
function fnv1a64(data: string): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < data.length; i++) {
    h ^= BigInt(data.charCodeAt(i) & 0xff);
    h = (h * prime) & mask;
  }
  return h.toString(16).padStart(16, '0');
}

// ------------------------------------------------------------------ types

/** Per-partition stats. */
export interface PartitionStats {
  readonly index: number;
  readonly records: number;
  readonly parked: number;
}

/** Result of a full parallel drain. */
export interface PartitionDrainResult {
  readonly perPartition: Array<{ index: number; processed: number; parked: number; deferred: number }>;
  readonly totalProcessed: number;
  readonly totalParked: number;
}

// ------------------------------------------------------------------ inbox

export class PartitionedInbox {
  private readonly _partitions: InboxEngine[];
  private readonly _now: () => number;

  constructor(partitionCount: number, config?: Partial<InboxEngineConfig>, now: () => number = Date.now) {
    if (partitionCount < 1) throw new Error('partitionCount must be >= 1');
    this._partitions = Array.from({ length: partitionCount }, () => new InboxEngine(config, now));
    this._now = now;
  }

  get partitionCount(): number {
    return this._partitions.length;
  }

  /** Consistent key → partition assignment (FNV-1a mod N). */
  partitionFor(key: string): number {
    const h = fnv1a64(key);
    return parseInt(h.slice(-8), 16) % this._partitions.length;
  }

  /** Route a message to its key's partition. */
  receive(consumer: string, key: string, payload: unknown, sequence?: number): ReceiveResult & { partition: number } {
    const p = this.partitionFor(key);
    const res = this._partitions[p]!.receive(consumer, key, payload, sequence);
    return { ...res, partition: p };
  }

  /** Drain one partition serially. */
  async processPartition(index: number, consumer: string, handler: MessageHandler): Promise<{ processed: number; parked: number; deferred: number }> {
    return this._partitions[index]!.processAll(consumer, handler);
  }

  /**
   * Drain ALL partitions in parallel — the parallel-processing payoff.
   * Returns per-partition results plus totals.
   */
  async processAll(consumer: string, handler: MessageHandler): Promise<PartitionDrainResult> {
    const per = await Promise.all(
      this._partitions.map(async (engine, i) => {
        const r = await engine.processAll(consumer, handler);
        return { index: i, processed: r.processed, parked: r.parked, deferred: r.deferred };
      }),
    );
    return {
      perPartition: per,
      totalProcessed: per.reduce((a, p) => a + p.processed, 0),
      totalParked: per.reduce((a, p) => a + p.parked, 0),
    };
  }

  /** Get a partition's engine (for record inspection, parked, stats). */
  engine(partition: number): InboxEngine {
    return this._partitions[partition]!;
  }

  /** Partition-level stats. */
  stats(consumer: string): PartitionStats[] {
    return this._partitions.map((engine, i) => ({
      index: i,
      records: engine.size(),
      parked: engine.parked(consumer).length,
    }));
  }

  /** Global parked records across partitions. */
  parked(consumer: string): Array<{ partition: number; recordIds: string[] }> {
    return this._partitions
      .map((engine, i) => ({ partition: i, recordIds: engine.parked(consumer).map((r) => r.id) }))
      .filter((p) => p.recordIds.length > 0);
  }
}
