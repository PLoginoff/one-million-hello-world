/**
 * SIEM Alert State Machine + Storage
 *
 * Alerts progress firing → acknowledged → resolved (or firing → resolved
 * directly). A dedup key prevents the same detection from piling up:
 * repeated fires on the same key bump `occurrences` and refresh
 * `lastFiredMs` instead of creating a new alert row.
 *
 * Also includes:
 *   - `SeverityScorer` — numeric 0-100 score from rule severity + context
 *     (watchlist membership, asset criticality, repeat count).
 *   - `EventStore` — retention-tiered, searchable event repository with
 *     field filters + time range queries.
 *
 * @module SiemLayer/Engine
 */

import { CorrelationMatch } from './CorrelationEngine';
import { NormalizedEvent } from './EventNormalizer';
import { IClock, SystemClock } from '../../observability/engine/signals';

export type AlertStatus = 'firing' | 'acknowledged' | 'resolved' | 'suppressed';

export interface Alert {
  readonly id: string;
  readonly dedupKey: string;
  readonly ruleId: string;
  readonly title: string;
  status: AlertStatus;
  severity: string;
  /** Computed 0-100 score, updated on each re-fire. */
  score: number;
  occurrences: number;
  readonly firstFiredMs: number;
  lastFiredMs: number;
  acknowledgedBy?: string;
  acknowledgedMs?: number;
  resolvedBy?: string;
  resolvedMs?: number;
  /** Event ids that triggered the latest fire (cap: last 20). */
  evidenceEventIds: number[];
}

export interface AlertManagerConfig {
  /** Watchlist sets — matching entities raise the alert score. */
  readonly watchlistIps?: ReadonlyArray<string>;
  readonly watchlistUsers?: ReadonlyArray<string>;
  /** Evidence cap per alert. */
  readonly maxEvidenceIds?: number;
}

/** Numeric severity → score contribution. */
const SEVERITY_SCORE: Record<string, number> = {
  info: 10,
  low: 20,
  medium: 40,
  high: 70,
  critical: 90,
};

/**
 * Computes a 0-100 alert score:
 *   base(rule severity) + watchlist bonus + repeat bonus + outcome bonus
 * clamped to [0, 100].
 */
export class SeverityScorer {
  private readonly _watchIps: Set<string>;
  private readonly _watchUsers: Set<string>;
  private readonly _assetCriticality: Map<string, number>;

  constructor(opts: {
    watchlistIps?: ReadonlyArray<string>;
    watchlistUsers?: ReadonlyArray<string>;
    /** host → criticality 0-10 (adds up to 15 points). */
    assetCriticality?: Readonly<Record<string, number>>;
  } = {}) {
    this._watchIps = new Set(opts.watchlistIps ?? []);
    this._watchUsers = new Set(opts.watchlistUsers ?? []);
    this._assetCriticality = new Map(Object.entries(opts.assetCriticality ?? {}));
  }

  score(match: CorrelationMatch, occurrences: number): number {
    let s = SEVERITY_SCORE[match.severity] ?? 30;
    const ips = match.events.map((e) => e.sourceIp).filter(Boolean) as string[];
    const users = match.events.map((e) => e.user).filter(Boolean) as string[];
    const hosts = match.events.map((e) => e.sourceHost).filter(Boolean) as string[];
    if (ips.some((ip) => this._watchIps.has(ip))) s += 15;
    if (users.some((u) => this._watchUsers.has(u))) s += 15;
    for (const h of hosts) {
      const crit = this._assetCriticality.get(h);
      if (crit !== undefined) s += Math.min(15, Math.round(crit * 1.5));
    }
    // Repeat fires escalate: +4 per occurrence past the first, capped.
    s += Math.min(20, Math.max(0, (occurrences - 1) * 4));
    return Math.max(0, Math.min(100, s));
  }

  isWatchlisted(entity: { ip?: string; user?: string }): boolean {
    return (
      (entity.ip !== undefined && this._watchIps.has(entity.ip)) ||
      (entity.user !== undefined && this._watchUsers.has(entity.user))
    );
  }
}

let nextAlertSeq = 1;

/**
 * Alert lifecycle manager. All transitions validate the state machine;
 * illegal transitions throw `AlertStateError`.
 */
export class AlertManager {
  private readonly _alerts: Map<string, Alert> = new Map();
  private readonly _byDedup: Map<string, string> = new Map();
  private readonly _scorer: SeverityScorer;
  private readonly _clock: IClock;
  private readonly _maxEvidence: number;

  constructor(config: AlertManagerConfig = {}, clock: IClock = new SystemClock()) {
    this._clock = clock;
    this._scorer = new SeverityScorer(config);
    this._maxEvidence = config.maxEvidenceIds ?? 20;
  }

  get scorer(): SeverityScorer {
    return this._scorer;
  }

  /**
   * Fire a correlation match. If a live alert exists for the dedup key,
   * it's re-fired (occurrences++). Resolved alerts re-open as 'firing'.
   */
  fire(match: CorrelationMatch): Alert {
    const existingId = this._byDedup.get(match.dedupKey);
    const now = this._clock.nowMs();
    if (existingId) {
      const a = this._alerts.get(existingId);
      if (a && a.status !== 'resolved') {
        a.occurrences++;
        a.lastFiredMs = now;
        a.score = this._scorer.score(match, a.occurrences);
        a.evidenceEventIds = this._mergeEvidence(a.evidenceEventIds, match);
        return a;
      }
      // Resolved → reopen as a fresh firing alert on the same row.
      if (a) {
        a.status = 'firing';
        a.occurrences++;
        a.lastFiredMs = now;
        a.score = this._scorer.score(match, a.occurrences);
        a.acknowledgedBy = undefined;
        a.acknowledgedMs = undefined;
        a.resolvedBy = undefined;
        a.resolvedMs = undefined;
        a.evidenceEventIds = this._mergeEvidence([], match);
        return a;
      }
    }
    const alert: Alert = {
      id: `alert-${nextAlertSeq++}`,
      dedupKey: match.dedupKey,
      ruleId: match.ruleId,
      title: match.ruleName,
      status: 'firing',
      severity: match.severity,
      score: this._scorer.score(match, 1),
      occurrences: 1,
      firstFiredMs: match.completedMs,
      lastFiredMs: now,
      evidenceEventIds: this._mergeEvidence([], match),
    };
    this._alerts.set(alert.id, alert);
    this._byDedup.set(match.dedupKey, alert.id);
    return alert;
  }

  private _mergeEvidence(existing: number[], match: CorrelationMatch): number[] {
    const ids = [...existing];
    for (const e of match.events) {
      if (!ids.includes(e.id)) ids.push(e.id);
    }
    return ids.slice(-this._maxEvidence);
  }

  /** firing → acknowledged. */
  acknowledge(alertId: string, by: string): Alert {
    const a = this._get(alertId);
    if (a.status === 'resolved') {
      throw new AlertStateError(`alert ${alertId} is resolved; reopen instead`);
    }
    a.status = 'acknowledged';
    a.acknowledgedBy = by;
    a.acknowledgedMs = this._clock.nowMs();
    return a;
  }

  /** firing|acknowledged → resolved. */
  resolve(alertId: string, by: string): Alert {
    const a = this._get(alertId);
    if (a.status === 'resolved') {
      throw new AlertStateError(`alert ${alertId} already resolved`);
    }
    a.status = 'resolved';
    a.resolvedBy = by;
    a.resolvedMs = this._clock.nowMs();
    return a;
  }

  /** Suppress (e.g. known false positive) without resolving. */
  suppress(alertId: string): Alert {
    const a = this._get(alertId);
    if (a.status === 'resolved') {
      throw new AlertStateError(`alert ${alertId} already resolved`);
    }
    a.status = 'suppressed';
    return a;
  }

  get(alertId: string): Alert | undefined {
    return this._alerts.get(alertId);
  }

  private _get(alertId: string): Alert {
    const a = this._alerts.get(alertId);
    if (!a) throw new AlertStateError(`unknown alert ${alertId}`);
    return a;
  }

  query(filter: {
    status?: AlertStatus;
    ruleId?: string;
    minScore?: number;
  } = {}): Alert[] {
    const out: Alert[] = [];
    for (const a of this._alerts.values()) {
      if (filter.status && a.status !== filter.status) continue;
      if (filter.ruleId && a.ruleId !== filter.ruleId) continue;
      if (filter.minScore !== undefined && a.score < filter.minScore) continue;
      out.push(a);
    }
    // Highest score first, then most recent.
    return out.sort((x, y) => y.score - x.score || y.lastFiredMs - x.lastFiredMs);
  }

  counts(): Record<AlertStatus, number> {
    const c: Record<AlertStatus, number> = { firing: 0, acknowledged: 0, resolved: 0, suppressed: 0 };
    for (const a of this._alerts.values()) c[a.status]++;
    return c;
  }
}

export class AlertStateError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'AlertStateError';
  }
}

// ---------------------------------------------------------------------------
// Event store: retention tiers + field/time search.
// ---------------------------------------------------------------------------

/** Storage tier names, ordered hot → cold. */
export type RetentionTier = 'hot' | 'warm' | 'cold';

export interface TierPolicy {
  readonly tier: RetentionTier;
  /** Events older than `olderThanMs` are moved to the next tier. */
  readonly olderThanMs: number;
}

/**
 * In-memory event repository with tiered retention.
 *
 * Storage layout: events are appended to per-tier arrays in arrival
 * order (timestamps are non-decreasing in the common case, giving us a
 * cheap implicit time index). Search does a linear scan with early-exit
 * on tier bounds — fine for SIEM-scale tests; production would page to
 * columnar storage.
 */
export class EventStore {
  private readonly _tiers: Record<RetentionTier, NormalizedEvent[]> = {
    hot: [],
    warm: [],
    cold: [],
  };
  private readonly _policies: TierPolicy[];
  private readonly _clock: IClock;
  /** Cap per tier; oldest evicted when full. 0 = unbounded. */
  private readonly _tierCap: number;

  constructor(
    policies: TierPolicy[] = [
      { tier: 'hot', olderThanMs: 24 * 3600 * 1000 },
      { tier: 'warm', olderThanMs: 7 * 24 * 3600 * 1000 },
      { tier: 'cold', olderThanMs: 30 * 24 * 3600 * 1000 },
    ],
    clock: IClock = new SystemClock(),
    tierCap = 0
  ) {
    this._policies = policies;
    this._clock = clock;
    this._tierCap = tierCap;
  }

  add(event: NormalizedEvent): void {
    this._tiers.hot.push(event);
    if (this._tierCap > 0 && this._tiers.hot.length > this._tierCap) {
      this._tiers.hot.shift();
    }
  }

  addAll(events: ReadonlyArray<NormalizedEvent>): void {
    for (const e of events) this.add(e);
  }

  /**
   * Age events through the tiers. Call periodically (e.g. on a timer or
   * lazily before queries).
   */
  applyRetention(): { movedToWarm: number; movedToCold: number; expired: number } {
    const now = this._clock.nowMs();
    const hotAge = this._ageOf('hot');
    const warmAge = this._ageOf('warm');
    const coldAge = this._ageOf('cold');
    const result = { movedToWarm: 0, movedToCold: 0, expired: 0 };

    this._tiers.warm.push(...this._drainOlderThan(this._tiers.hot, now - hotAge, (n) => (result.movedToWarm = n)));
    this._tiers.cold.push(...this._drainOlderThan(this._tiers.warm, now - warmAge, (n) => (result.movedToCold = n)));
    result.expired = this._expireOlderThan(this._tiers.cold, now - coldAge);
    void warmAge; void coldAge;
    return result;
  }

  private _ageOf(tier: RetentionTier): number {
    const idx = ['hot', 'warm', 'cold'].indexOf(tier);
    return this._policies[Math.min(idx, this._policies.length - 1)].olderThanMs;
  }

  /**
   * Move events older than `cutoffMs` out of `arr`, returning them.
   * Events are time-ordered so we can splice a prefix — O(k) not O(n).
   */
  private _drainOlderThan(arr: NormalizedEvent[], cutoffMs: number, report: (n: number) => void): NormalizedEvent[] {
    let i = 0;
    while (i < arr.length && arr[i].timestampMs < cutoffMs) i++;
    report(i);
    return arr.splice(0, i);
  }

  private _expireOlderThan(arr: NormalizedEvent[], cutoffMs: number): number {
    let i = 0;
    while (i < arr.length && arr[i].timestampMs < cutoffMs) i++;
    arr.splice(0, i);
    return i;
  }

  /**
   * Field-filter + time-range search across all tiers.
   * `filter.fields` is exact-match on normalized top-level props first,
   * then on `fields` map. `text` does a substring scan on `raw`.
   */
  search(filter: {
    fields?: Record<string, string>;
    text?: string;
    fromMs?: number;
    toMs?: number;
    limit?: number;
  } = {}): NormalizedEvent[] {
    const out: NormalizedEvent[] = [];
    const limit = filter.limit ?? Number.MAX_SAFE_INTEGER;
    for (const tier of ['hot', 'warm', 'cold'] as RetentionTier[]) {
      for (const e of this._tiers[tier]) {
        if (out.length >= limit) return out;
        if (filter.fromMs !== undefined && e.timestampMs < filter.fromMs) continue;
        if (filter.toMs !== undefined && e.timestampMs > filter.toMs) continue;
        if (filter.text && !e.raw.includes(filter.text)) continue;
        if (filter.fields) {
          let ok = true;
          for (const [k, v] of Object.entries(filter.fields)) {
            const top = (e as unknown as Record<string, unknown>)[k];
            const actual = top !== undefined ? String(top) : e.fields[k];
            if (actual !== v) {
              ok = false;
              break;
            }
          }
          if (!ok) continue;
        }
        out.push(e);
      }
    }
    return out;
  }

  size(tier?: RetentionTier): number {
    if (tier) return this._tiers[tier].length;
    return this._tiers.hot.length + this._tiers.warm.length + this._tiers.cold.length;
  }
}
