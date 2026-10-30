/**
 * VelocityTracker — exact rolling-window counters per entity.
 *
 * Fraud's most reliable signal is velocity: a card tested at 12
 * merchants in a minute, a device opening 9 accounts in a day.
 * `FeatureExtractor` counts these by filtering a transaction array —
 * O(history) per transaction. This tracker keeps per-entity event
 * logs in sorted order, so feature extraction is O(log n) binary
 * search + O(window-population) aggregation.
 *
 * For every transaction it maintains separate logs for the card
 * (`metadata.cardId` → fallback userId), user, device, and IP —
 * attackers hop across users but share infrastructure, so all four
 * dimensions matter.
 *
 * Windows: 1 minute (card testing bursts), 1 hour (velocity abuse),
 * 1 day (account-takeover scope). Exact — not bucketed approximations —
 * because fraud decisions need precise counts at boundaries.
 *
 * Memory: O(events retained). `prune(olderThan)` trims expired
 * history; callers drive it periodically.
 *
 * @module FraudDetectionLayer/Engine
 */

import { Transaction } from '../implementations/fraud/Types';
import {
  FraudClock,
  ManualFraudClock,
  VelocityDimension,
  VelocityFeatures,
} from './types';

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

interface LogEntry {
  readonly t: number;
  readonly amount: number;
  /** counterparty id for distinct counting (merchant or user) */
  readonly counterparty: string;
}

interface EntityLog {
  entries: LogEntry[];
  lastT: number;
}

export class VelocityTracker {
  private readonly _clock: FraudClock;
  /** dimension → entity key → sorted event log */
  private readonly _logs: Map<VelocityDimension, Map<string, EntityLog>>;

  constructor(clock?: FraudClock) {
    this._clock = clock ?? new ManualFraudClock();
    this._logs = new Map([
      ['card', new Map()],
      ['user', new Map()],
      ['device', new Map()],
      ['ip', new Map()],
    ]);
  }

  /**
   * Record a transaction against every entity it touches, then
   * return features for the *card* dimension (the primary fraud
   * subject) — call `featuresFor` for other dimensions.
   */
  track(tx: Transaction): VelocityFeatures {
    const t = tx.timestamp;
    const cardKey = cardIdOf(tx) ?? tx.userId;
    this._append('card', cardKey, {
      t,
      amount: tx.amount,
      counterparty: tx.merchantId ?? 'unknown',
    });
    this._append('user', tx.userId, {
      t,
      amount: tx.amount,
      counterparty: tx.merchantId ?? 'unknown',
    });
    if (tx.deviceId !== undefined) {
      this._append('device', tx.deviceId, {
        t,
        amount: tx.amount,
        counterparty: tx.userId,
      });
    }
    if (tx.ipAddress !== undefined) {
      this._append('ip', tx.ipAddress, {
        t,
        amount: tx.amount,
        counterparty: tx.userId,
      });
    }
    return this.featuresFor('card', cardKey);
  }

  /**
   * Features for one entity at the clock's current instant.
   * Empty key → all zeros (first-seen entity is not suspicious).
   */
  featuresFor(dimension: VelocityDimension, key: string): VelocityFeatures {
    const log = this._logs.get(dimension)!.get(key);
    if (log === undefined) {
      return {
        dimension,
        key,
        count1m: 0,
        count1h: 0,
        count1d: 0,
        sum1m: 0,
        sum1h: 0,
        sum1d: 0,
        distinct1d: 0,
        interArrivalMs: -1,
      };
    }
    const now = this._clock.now();
    const c1 = this._window(log, now - MINUTE);
    const cH = this._window(log, now - HOUR);
    const cD = this._window(log, now - DAY);
    return {
      dimension,
      key,
      count1m: c1.count,
      count1h: cH.count,
      count1d: cD.count,
      sum1m: c1.sum,
      sum1h: cH.sum,
      sum1d: cD.sum,
      distinct1d: cD.distinct,
      interArrivalMs:
        log.entries.length === 0 ? -1 : now - log.entries[log.entries.length - 1].t,
    };
  }

  /** Drop history older than `minT` (default: 1 day ago). */
  prune(minT?: number): number {
    const cutoff = minT ?? this._clock.now() - DAY;
    let dropped = 0;
    for (const dim of this._logs.values()) {
      for (const [key, log] of dim) {
        const idx = lowerBound(log.entries, cutoff);
        if (idx > 0) {
          log.entries.splice(0, idx);
          dropped += idx;
        }
        if (log.entries.length === 0) dim.delete(key);
      }
    }
    return dropped;
  }

  /** Number of entities tracked per dimension. */
  entityCount(dimension: VelocityDimension): number {
    return this._logs.get(dimension)!.size;
  }

  /* ---------------------------------------------------------------- */

  private _append(
    dim: VelocityDimension,
    key: string,
    entry: LogEntry
  ): void {
    const dimMap = this._logs.get(dim)!;
    let log = dimMap.get(key);
    if (log === undefined) {
      log = { entries: [], lastT: -1 };
      dimMap.set(key, log);
    }
    // Out-of-order events: keep sorted via insert at bound.
    const idx = upperBound(log.entries, entry.t);
    log.entries.splice(idx, 0, entry);
    log.lastT = entry.t;
  }

  private _window(
    log: EntityLog,
    from: number
  ): { count: number; sum: number; distinct: number } {
    const start = lowerBound(log.entries, from);
    let sum = 0;
    const distinct = new Set<string>();
    let count = 0;
    for (let i = start; i < log.entries.length; i++) {
      count++;
      sum += log.entries[i].amount;
      distinct.add(log.entries[i].counterparty);
    }
    return { count, sum, distinct: distinct.size };
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Extract a card id from metadata if the transaction carries one. */
function cardIdOf(tx: Transaction): string | undefined {
  const v = tx.metadata?.['cardId'];
  return typeof v === 'string' ? v : undefined;
}

/** First index with entries[i].t >= t. */
function lowerBound(entries: readonly LogEntry[], t: number): number {
  let lo = 0;
  let hi = entries.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (entries[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** First index with entries[i].t > t (insertion point). */
function upperBound(entries: readonly LogEntry[], t: number): number {
  let lo = 0;
  let hi = entries.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (entries[mid].t <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
