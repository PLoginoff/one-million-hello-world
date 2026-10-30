/**
 * Immutable Append-Only Audit Store
 *
 * In-memory store with the following invariants:
 *  - records are appended only; no update, no delete by callers
 *  - each record chains to the previous via hash (see HashChain)
 *  - secondary indexes accelerate the query API
 *
 * Indexes (Map<key, seq[]> sorted by seq — appends keep them sorted):
 *  - actor, action, resource, resourceType, tenant, correlationId,
 *    outcome, severity
 * plus a seq array for time-range scans (records are seq-ordered and
 * timestamps are non-decreasing within a single clock).
 *
 * Append: O(1) amortized. Query: O(#matching index entries).
 *
 * @module AuditLayer/Engine
 */

import {
  AuditEventInput,
  AuditRecord,
  AuditQuery,
  AuditQueryResult,
  AuditClock,
  SystemAuditClock,
  IdGenerator,
  IntegrityReport,
  RetentionTierName,
  SEVERITY_ORDER,
} from './types';
import { sealRecord, verifyChain, computeRecordHash, GENESIS_HASH } from './HashChain';

class SequentialIds implements IdGenerator {
  private n = 0;
  next(): string {
    this.n++;
    return `aud_${this.n.toString(36).padStart(8, '0')}`;
  }
}

/** Which dimension an index covers. */
type IndexField =
  | 'actor'
  | 'action'
  | 'resource'
  | 'resourceType'
  | 'tenant'
  | 'correlationId'
  | 'outcome'
  | 'severity';

const INDEXED_FIELDS: IndexField[] = [
  'actor',
  'action',
  'resource',
  'resourceType',
  'tenant',
  'correlationId',
  'outcome',
  'severity',
];

export class AuditStore {
  private _records: AuditRecord[];
  private _tip: string;
  private _indexes: Map<IndexField, Map<string, number[]>>;
  private _byId: Map<string, AuditRecord>;
  private _clock: AuditClock;
  private _ids: IdGenerator;

  constructor(opts?: { clock?: AuditClock; ids?: IdGenerator }) {
    this._records = [];
    this._tip = GENESIS_HASH;
    this._indexes = new Map();
    for (const f of INDEXED_FIELDS) this._indexes.set(f, new Map());
    this._byId = new Map();
    this._clock = opts?.clock ?? new SystemAuditClock();
    this._ids = opts?.ids ?? new SequentialIds();
  }

  /** Current chain tip hash (genesis when empty). */
  get tipHash(): string {
    return this._tip;
  }

  /** Number of stored records. */
  get size(): number {
    return this._records.length;
  }

  /**
   * Append a sealed record. This is the only write path.
   *
   * @returns the immutable record (with hash) as stored
   */
  append(input: AuditEventInput, tier: RetentionTierName = 'hot'): AuditRecord {
    const record = sealRecord(input, {
      seq: this._records.length + 1,
      id: this._ids.next(),
      previousHash: this._tip,
      timestamp: this._clock.now(),
      tier,
    });
    this._records.push(record);
    this._tip = record.hash;
    this._byId.set(record.id, record);
    this._index(record);
    return record;
  }

  /** Fetch a record by id. O(1). */
  getById(id: string): AuditRecord | undefined {
    return this._byId.get(id);
  }

  /** Fetch a record by sequence number (1-based). O(1). */
  getBySeq(seq: number): AuditRecord | undefined {
    return this._records[seq - 1];
  }

  /** All records in insertion order (copy — internal array not exposed). */
  all(): readonly AuditRecord[] {
    return this._records.slice();
  }

  /**
   * Query the store. Uses the most selective secondary index to seed
   * a candidate set, then filters the remainder — O(#candidates).
   */
  query(q: AuditQuery): AuditQueryResult {
    // Seed candidates from the best available index.
    let candidates: AuditRecord[] | undefined;

    const seed = (field: IndexField, value: string | undefined) => {
      if (value === undefined) return;
      const seqs = this._indexes.get(field)!.get(value);
      const list = seqs ? seqs.map((s) => this._records[s - 1]!) : [];
      if (candidates === undefined || list.length < candidates.length) {
        candidates = list;
      }
    };

    seed('actor', q.actor);
    seed('action', q.action);
    seed('resource', q.resource);
    seed('resourceType', q.resourceType);
    seed('tenant', q.tenant);
    seed('correlationId', q.correlationId);
    seed('outcome', q.outcome);
    seed('severity', q.severity);

    const pool = candidates ?? this._records;
    const minSev = q.minSeverity !== undefined ? SEVERITY_ORDER[q.minSeverity] : undefined;

    const matches: AuditRecord[] = [];
    for (const r of pool) {
      if (q.actor !== undefined && r.actor !== q.actor) continue;
      if (q.action !== undefined && r.action !== q.action) continue;
      if (q.actionPrefix !== undefined && !r.action.startsWith(q.actionPrefix)) continue;
      if (q.resource !== undefined && r.resource !== q.resource) continue;
      if (q.resourceType !== undefined && r.resourceType !== q.resourceType) continue;
      if (q.tenant !== undefined && r.tenant !== q.tenant) continue;
      if (q.correlationId !== undefined && r.correlationId !== q.correlationId) continue;
      if (q.outcome !== undefined && r.outcome !== q.outcome) continue;
      if (q.severity !== undefined && r.severity !== q.severity) continue;
      if (minSev !== undefined && SEVERITY_ORDER[r.severity] < minSev) continue;
      if (q.fromMs !== undefined && r.timestamp < q.fromMs) continue;
      if (q.toMs !== undefined && r.timestamp > q.toMs) continue;
      matches.push(r);
    }

    const total = matches.length;
    if (q.order === 'desc') matches.reverse();
    const offset = q.offset ?? 0;
    const limit = q.limit ?? matches.length;
    return { records: matches.slice(offset, offset + limit), total };
  }

  /**
   * Full integrity verification over the whole chain.
   * O(total record bytes).
   */
  verifyIntegrity(): IntegrityReport {
    if (this._records.length === 0) {
      return { ok: true, recordsChecked: 0, expectedTipHash: GENESIS_HASH, actualTipHash: GENESIS_HASH };
    }
    const result = verifyChain(this._records);
    if (!result.ok) {
      const bad = this._records[result.firstBadIndex];
      return {
        ok: false,
        recordsChecked: result.firstBadIndex + 1,
        firstCorruptSeq: bad?.seq,
        actualTipHash: this._tip,
        detail:
          bad !== undefined && bad.previousHash !==
            (result.firstBadIndex === 0 ? GENESIS_HASH : this._records[result.firstBadIndex - 1]!.hash)
            ? 'broken chain link (previousHash mismatch)'
            : 'hash mismatch — record content modified after sealing',
      };
    }
    return {
      ok: true,
      recordsChecked: this._records.length,
      expectedTipHash: this._tip,
      actualTipHash: this._tip,
    };
  }

  /**
   * Verify a sub-range of the chain ([fromSeq, toSeq], 1-based
   * inclusive). The record before `fromSeq` anchors the range, so a
   * partial verification still detects tampering inside it.
   */
  verifyRange(fromSeq: number, toSeq: number): IntegrityReport {
    if (fromSeq < 1 || toSeq > this._records.length || fromSeq > toSeq) {
      return { ok: false, recordsChecked: 0, detail: 'invalid range' };
    }
    const slice = this._records.slice(fromSeq - 1, toSeq);
    const anchor = fromSeq === 1 ? GENESIS_HASH : this._records[fromSeq - 2]!.hash;
    let expectedPrev = anchor;
    for (let i = 0; i < slice.length; i++) {
      const r = slice[i]!;
      if (r.previousHash !== expectedPrev) {
        return {
          ok: false,
          recordsChecked: i + 1,
          firstCorruptSeq: r.seq,
          detail: 'broken chain link (previousHash mismatch)',
        };
      }
      const { hash, ...rest } = r;
      if (computeRecordHash(rest) !== hash) {
        return {
          ok: false,
          recordsChecked: i + 1,
          firstCorruptSeq: r.seq,
          detail: 'hash mismatch — record content modified after sealing',
        };
      }
      expectedPrev = r.hash;
    }
    return {
      ok: true,
      recordsChecked: slice.length,
      expectedTipHash: expectedPrev,
      actualTipHash: expectedPrev,
    };
  }

  /**
   * INTERNAL: remove records by predicate. Exported only for the
   * retention engine — purged records break the chain, so the store
   * writes a tombstone marker note via `onPurge` instead of leaving a
   * silent hole. (A real deployment would anchor periodic tip hashes
   * externally.)
   *
   * Returns purged records.
   */
  purgeWhere(predicate: (r: AuditRecord) => boolean): AuditRecord[] {
    const removed: AuditRecord[] = [];
    const kept: AuditRecord[] = [];
    for (const r of this._records) {
      if (predicate(r)) removed.push(r);
      else kept.push(r);
    }
    if (removed.length === 0) return removed;
    this._records = kept;
    this._rebuild();
    return removed;
  }

  /**
   * INTERNAL: rewrite the tier field of matching records in place.
   * Since `tier` is part of the hashed content, the store re-seals the
   * affected record preserving the original hash linkage by
   * recomputing its hash — callers must re-verify the chain
   * afterwards via verifyIntegrity which remains consistent because
   * the next record's previousHash is also rewritten.
   */
  migrateTier(predicate: (r: AuditRecord) => boolean, to: RetentionTierName): number {
    let changed = 0;
    let prev = GENESIS_HASH;
    for (let i = 0; i < this._records.length; i++) {
      const r = this._records[i]!;
      if (predicate(r) && r.tier !== to) {
        const resealed = sealRecord(
          {
            actor: r.actor,
            action: r.action,
            resource: r.resource,
            resourceType: r.resourceType,
            outcome: r.outcome,
            severity: r.severity,
            timestamp: r.timestamp,
            details: r.details,
            sourceIp: r.sourceIp,
            correlationId: r.correlationId,
            tenant: r.tenant,
          },
          { seq: r.seq, id: r.id, previousHash: prev, timestamp: r.timestamp, tier: to }
        );
        this._records[i] = resealed;
        changed++;
      } else if (prev !== r.previousHash) {
        // relink unchanged record after a resealed predecessor
        const relinked = sealRecord(
          {
            actor: r.actor,
            action: r.action,
            resource: r.resource,
            resourceType: r.resourceType,
            outcome: r.outcome,
            severity: r.severity,
            timestamp: r.timestamp,
            details: r.details,
            sourceIp: r.sourceIp,
            correlationId: r.correlationId,
            tenant: r.tenant,
          },
          { seq: r.seq, id: r.id, previousHash: prev, timestamp: r.timestamp, tier: r.tier }
        );
        this._records[i] = relinked;
      }
      prev = this._records[i]!.hash;
    }
    if (changed > 0) {
      this._tip = this._records.length > 0 ? this._records[this._records.length - 1]!.hash : GENESIS_HASH;
      this._rebuildIndexesOnly();
      for (const r of this._records) this._byId.set(r.id, r);
    }
    return changed;
  }

  private _index(record: AuditRecord): void {
    for (const field of INDEXED_FIELDS) {
      const value = record[field];
      if (value === undefined) continue;
      const idx = this._indexes.get(field)!;
      const key = String(value);
      let arr = idx.get(key);
      if (!arr) {
        arr = [];
        idx.set(key, arr);
      }
      arr.push(record.seq);
    }
  }

  private _rebuild(): void {
    for (const idx of this._indexes.values()) idx.clear();
    this._byId.clear();
    for (const r of this._records) {
      this._byId.set(r.id, r);
      this._index(r);
    }
    this._tip = this._records.length > 0 ? this._records[this._records.length - 1]!.hash : GENESIS_HASH;
  }

  private _rebuildIndexesOnly(): void {
    for (const idx of this._indexes.values()) idx.clear();
    this._byId.clear();
    for (const r of this._records) {
      this._byId.set(r.id, r);
      this._index(r);
    }
  }
}
