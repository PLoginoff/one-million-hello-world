/**
 * Retention Manager
 *
 * Applies tiered retention to the audit store:
 *
 *   hot -> warm -> cold -> frozen -> purge
 *
 * Each `sweep()` (typically run periodically):
 *  1. promotes records whose age exceeds their tier's `maxAgeMs`
 *  2. purges records older than `purgeAfterMs` — EXCEPT records under
 *     an active legal hold, which are retained regardless of age
 *
 * Legal holds match records by actor/resource/resourceType/tenant
 * and an optional time window. Any matching hold prevents purge.
 *
 * @module AuditLayer/Engine
 */

import {
  AuditRecord,
  LegalHold,
  RetentionPolicy,
  RetentionTierName,
  AuditClock,
  SystemAuditClock,
} from './types';
import { AuditStore } from './AuditStore';

const TIER_ORDER: Record<RetentionTierName, number> = {
  hot: 0,
  warm: 1,
  cold: 2,
  frozen: 3,
};

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  tiers: [
    { name: 'hot', maxAgeMs: 7 * 24 * 60 * 60 * 1000, next: 'warm' },
    { name: 'warm', maxAgeMs: 30 * 24 * 60 * 60 * 1000, next: 'cold' },
    { name: 'cold', maxAgeMs: 365 * 24 * 60 * 60 * 1000, next: 'frozen' },
    { name: 'frozen', maxAgeMs: Number.MAX_SAFE_INTEGER },
  ],
  purgeAfterMs: 7 * 365 * 24 * 60 * 60 * 1000,
};

export interface RetentionSweepResult {
  readonly promoted: number;
  readonly purged: number;
  readonly held: number;
}

/** Does a hold filter match a record? */
export function holdMatches(hold: LegalHold, r: AuditRecord): boolean {
  const f = hold.filter;
  if (f.actor !== undefined && r.actor !== f.actor) return false;
  if (f.resource !== undefined && r.resource !== f.resource) return false;
  if (f.resourceType !== undefined && r.resourceType !== f.resourceType) return false;
  if (f.tenant !== undefined && r.tenant !== f.tenant) return false;
  if (f.fromMs !== undefined && r.timestamp < f.fromMs) return false;
  if (f.toMs !== undefined && r.timestamp > f.toMs) return false;
  return true;
}

export class RetentionManager {
  private _store: AuditStore;
  private _policy: RetentionPolicy;
  private _holds: Map<string, LegalHold>;
  private _clock: AuditClock;
  private _holdSeq: number;

  constructor(store: AuditStore, policy?: RetentionPolicy, clock?: AuditClock) {
    this._store = store;
    this._policy = policy ?? DEFAULT_RETENTION_POLICY;
    this._holds = new Map();
    this._clock = clock ?? new SystemAuditClock();
    this._holdSeq = 0;
  }

  /** Place a legal hold. */
  addHold(filter: LegalHold['filter'], reason: string): LegalHold {
    this._holdSeq++;
    const hold: LegalHold = {
      id: `hold_${this._holdSeq}`,
      reason,
      createdAt: this._clock.now(),
      filter,
    };
    this._holds.set(hold.id, hold);
    return hold;
  }

  /** Release a hold by id. */
  removeHold(holdId: string): boolean {
    return this._holds.delete(holdId);
  }

  /** Active holds. */
  holds(): LegalHold[] {
    return [...this._holds.values()];
  }

  /** Is a record under any active hold? O(#holds). */
  isHeld(record: AuditRecord): boolean {
    for (const hold of this._holds.values()) {
      if (holdMatches(hold, record)) return true;
    }
    return false;
  }

  /** Tier a record should be in given its age. */
  targetTier(record: AuditRecord): RetentionTierName {
    const age = this._clock.now() - record.timestamp;
    let current: RetentionTierName = 'hot';
    // Walk the tier chain; promote while age exceeds each maxAgeMs.
    for (;;) {
      const tier = this._policy.tiers.find((t) => t.name === current);
      if (!tier || tier.next === undefined) return current;
      if (age <= tier.maxAgeMs) return current;
      current = tier.next;
    }
  }

  /**
   * Apply one retention sweep: promotions then purge.
   */
  sweep(): RetentionSweepResult {
    const now = this._clock.now();
    let promoted = 0;
    let purged = 0;
    let held = 0;

    // 1. Promotions — re-seal affected records into the target tier.
    for (const record of this._store.all()) {
      const target = this.targetTier(record);
      if (TIER_ORDER[target] > TIER_ORDER[record.tier]) {
        // Batch: migrateTier rescans; instead mark per-record.
        this._store.migrateTier((r) => r.seq === record.seq, target);
        promoted++;
      }
    }

    // 2. Purge expired, unheld records.
    const purgeBoundary = now - this._policy.purgeAfterMs;
    const removed = this._store.purgeWhere((r) => {
      if (r.timestamp > purgeBoundary) return false;
      if (this.isHeld(r)) {
        held++;
        return false;
      }
      return true;
    });
    purged = removed.length;

    return { promoted, purged, held };
  }
}
