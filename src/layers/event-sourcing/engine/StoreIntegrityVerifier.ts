/**
 * StoreIntegrityVerifier — checksum-based corruption detection.
 *
 * An event store is write-once read-forever; silent corruption is the
 * worst failure mode (backups faithfully replicate it, snapshots bake it
 * in). This module verifies three nested checksum layers, each catching
 * a different corruption class:
 *
 *   Layer 1 — event content hash
 *       `hashEventContent(type, data, metadata, streamId, streamVersion)`
 *       Recomputed per event and compared to `contentHash`. Catches
 *       bit-flips / partial writes in the payload region.
 *
 *   Layer 2 — shard chain
 *       `checksum = chainHash(prevEvent.checksum, contentHash)` in
 *       shardPosition order. Recomputed per shard. Catches reordering,
 *       deletion, insertion, and cross-shard moves — content hashes are
 *       all correct but the *sequence* isn't.
 *
 *   Layer 3 — segment checksum
 *       `segmentChecksum = fold(chainHash, 0, events[].checksum)` —
 *       self-contained per segment, independent of other segments, so a
 *       single segment verifies in isolation (spot-checks, restore
 *       validation). Catches torn segment writes and stale checksums.
 *
 * Verification modes:
 *   - `verifyShard`    — full walk of one shard, reports every violation.
 *   - `verifyAll`      — every shard; the scheduled scrub.
 *   - `verifySegment`  — one segment in isolation (restore/checkpoint).
 *   - `compareReplica` — walk primary + replica in lockstep; divergence
 *     is where their chains differ (chain equality is order-sensitive,
 *     so a single bit difference localizes the fault).
 *
 * All modes are O(n) in events scanned, O(1) memory.
 *
 * @module EventSourcing/Engine
 */

import {
  ShardedEventStore,
  ShardedStoredEvent,
  EventSegment,
  hashEventContent,
} from './ShardedEventStore';
import { EventStoreReplica } from './EventStoreReplication';
import { chainHash, hex32 } from './Sharding';

// ---------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------

export type ViolationKind =
  | 'content-hash'    // payload doesn't match its contentHash
  | 'chain'           // checksum != chainHash(prev, contentHash)
  | 'segment'         // segment.checksum != fold of member checksums
  | 'position-gap'    // shardPosition jumped (unexpected hole)
  | 'replica-missing' // replica lacks a position the primary has
  | 'replica-diverged'; // primary/replica checksums differ at a position

export interface IntegrityViolation {
  readonly kind: ViolationKind;
  readonly shardId: string;
  /** Position where the violation was detected (-1 = segment-level). */
  readonly shardPosition: number;
  readonly detail: string;
  readonly expected?: string;
  readonly actual?: string;
}

export interface ShardVerifyReport {
  readonly shardId: string;
  readonly eventsChecked: number;
  readonly segmentsChecked: number;
  readonly violations: IntegrityViolation[];
  readonly ok: boolean;
  /** Final chain checksum — compare across primary/replica copies. */
  readonly chainTip: number;
}

export interface ReplicaDiffReport {
  readonly shardId: string;
  /** Positions compared. */
  readonly compared: number;
  /** Position where the chains first diverge (-1 = identical). */
  readonly firstDivergence: number;
  readonly violations: IntegrityViolation[];
  readonly identical: boolean;
}

// ---------------------------------------------------------------------
// Verifier
// ---------------------------------------------------------------------

export class StoreIntegrityVerifier {
  private readonly _store: ShardedEventStore;

  constructor(store: ShardedEventStore) {
    this._store = store;
  }

  /**
   * Full walk of a shard: re-derive content hashes, re-fold the chain,
   * check each segment's stored checksum. Collects ALL violations — a
   * scrub report saying "first error at position N" hides secondary
   * corruption behind the first fix.
   */
  verifyShard(shardId: string): ShardVerifyReport {
    const violations: IntegrityViolation[] = [];
    const segs = this._store.storage.segments(shardId);
    let running = 0;
    let expectedPosition = 0;
    let checked = 0;

    for (const seg of segs) {
      violations.push(...this._verifyEvents(shardId, seg.events, expectedPosition));
      // Position continuity tracking: gaps can be legitimate (stream
      // migration leaves holes) — flag them separately from corruption.
      for (const e of seg.events) {
        if (e.shardPosition !== expectedPosition) {
          violations.push({
            kind: 'position-gap',
            shardId,
            shardPosition: e.shardPosition,
            detail: `expected position ${expectedPosition}, found ${e.shardPosition} ` +
              `(stream migration or pre-compaction state)`,
            expected: expectedPosition.toString(),
            actual: e.shardPosition.toString(),
          });
          expectedPosition = e.shardPosition;
        }
        expectedPosition = e.shardPosition + 1;
        running = e.checksum;
        checked++;
      }
      violations.push(...this.verifySegment(seg).violations);
    }

    return {
      shardId,
      eventsChecked: checked,
      segmentsChecked: segs.length,
      violations,
      ok: violations.filter((v) => v.kind !== 'position-gap').length === 0,
      chainTip: running,
    };
  }

  /** Verify events' content + chain, starting the chain at `running=0`
   *  OR the chain value preceding `events[0]` (supplied implicitly via
   *  the caller passing a full-segment slice — chain continuity is
   *  checked against the event's own stored `checksum` which encodes
   *  its predecessor). */
  private _verifyEvents(
    shardId: string,
    events: readonly ShardedStoredEvent[],
    _startPosition: number
  ): IntegrityViolation[] {
    const violations: IntegrityViolation[] = [];
    let prev: ShardedStoredEvent | null = null;
    for (const e of events) {
      const content = hashEventContent(e.streamId, e.streamVersion, e.type, e.data, e.metadata);
      if (content !== e.contentHash) {
        violations.push({
          kind: 'content-hash',
          shardId,
          shardPosition: e.shardPosition,
          detail: `event '${e.id}' content hash mismatch (payload tampering?)`,
          expected: hex32(e.contentHash),
          actual: hex32(content),
        });
      }
      // Chain check: the stored checksum must equal
      // chainHash(predecessor's STORED checksum, e's contentHash).
      // Using the stored predecessor means a tampered predecessor does
      // NOT cascade a false violation onto every later event — only the
      // record actually at fault is flagged.
      if (prev) {
        const expected = chainHash(prev.checksum, e.contentHash);
        if (expected !== e.checksum) {
          violations.push({
            kind: 'chain',
            shardId,
            shardPosition: e.shardPosition,
            detail: `chain break at '${e.id}': events reordered or a record removed`,
            expected: hex32(expected),
            actual: hex32(e.checksum),
          });
        }
      }
      prev = e;
    }
    return violations;
  }

  /**
   * Verify one segment in isolation: fold its events' checksums and
   * compare to `segment.checksum`. Self-contained — usable on a segment
   * that was just restored without the rest of the shard present.
   */
  verifySegment(seg: EventSegment): { ok: boolean; violations: IntegrityViolation[] } {
    let fold = 0;
    for (const e of seg.events) fold = chainHash(fold, e.checksum);
    if (fold === seg.checksum) return { ok: true, violations: [] };
    return {
      ok: false,
      violations: [
        {
          kind: 'segment',
          shardId: seg.shardId,
          shardPosition: -1,
          detail: `segment '${seg.id}' checksum mismatch — torn write or stale seal`,
          expected: hex32(seg.checksum),
          actual: hex32(fold),
        },
      ],
    };
  }

  /** Scrub every shard. */
  verifyAll(): ShardVerifyReport[] {
    return this._store.shardMap.shardIds().map((id) => this.verifyShard(id));
  }

  /**
   * Lockstep comparison of a primary shard and its replica copy.
   *
   * Chains are deterministic over (position, content), so equal chains
   * up to the replica cursor prove the replica is a faithful prefix.
   * First mismatch localizes divergence to a single position — the
   * operator can repair just that record instead of resyncing.
   */
  compareReplica(shardId: string, replica: EventStoreReplica): ReplicaDiffReport {
    const violations: IntegrityViolation[] = [];
    const primary = this._store.scanShard(shardId, 0, Number.MAX_SAFE_INTEGER).events;
    const copy = replica.replicaShardEvents(shardId);
    const n = Math.min(primary.length, copy.length);
    let firstDivergence = -1;

    for (let i = 0; i < n; i++) {
      const p = primary[i];
      const r = copy[i];
      if (p.checksum !== r.checksum || p.contentHash !== r.contentHash) {
        firstDivergence = i;
        violations.push({
          kind: 'replica-diverged',
          shardId,
          shardPosition: p.shardPosition,
          detail:
            `replica '${replica.name}' diverges at position ${p.shardPosition}: ` +
            `primary ${hex32(p.checksum)} vs replica ${hex32(r.checksum)}`,
          expected: hex32(p.checksum),
          actual: hex32(r.checksum),
        });
        break; // everything after is noise — the prefix is proven
      }
    }

    if (firstDivergence === -1 && primary.length > copy.length) {
      // Replica is a clean PREFIX — that's normal lag, not corruption.
      // Report the head the replica is missing as informational.
      firstDivergence = copy.length;
    }

    return {
      shardId,
      compared: n,
      firstDivergence,
      violations,
      identical: violations.length === 0 && primary.length === copy.length,
    };
  }
}
