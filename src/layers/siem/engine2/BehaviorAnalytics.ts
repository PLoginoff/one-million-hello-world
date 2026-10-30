/**
 * User Behavior Analytics (UBA) — per-user baselines + deviation scoring.
 *
 * The model is deliberately simple and explainable — UBA findings must
 * be defensible to an analyst, which rules out opaque embeddings. Each
 * user accumulates:
 *
 *   - action histogram        (what do they usually do?)
 *   - hour-of-day histogram   (when are they usually active?)
 *   - known source-IP set     (where do they usually come from?)
 *   - burst tracking          (is the current rate unusual?)
 *
 * `score(event)` returns 0..1 with itemized factors — each factor is a
 * weighted vote so an analyst can see exactly *why* it scored high.
 *
 * @module SiemLayer/Engine2
 */

import { NormalizedEvent } from '../engine/EventNormalizer';
import { IClock, SystemClock } from '../../observability/engine/signals';
import { DeviationFactor, DeviationScore, UserBaseline } from './types';

const HOURS = 24;
const MAX_KNOWN_IPS = 64;
const MIN_EVENTS_FOR_BASELINE = 20;

interface UserProfile {
  firstSeenMs: number;
  lastSeenMs: number;
  total: number;
  actions: Map<string, number>;
  hours: number[];
  ips: Set<string>;
  /** Sliding per-minute activity for burst detection. */
  recentMinuteMs: number;
  recentCount: number;
}

export interface UbaWeights {
  newIp: number;
  unusualHour: number;
  unusualAction: number;
  burst: number;
  newUser: number;
}

export const DEFAULT_UBA_WEIGHTS: UbaWeights = {
  newIp: 0.35,
  unusualHour: 0.25,
  unusualAction: 0.2,
  burst: 0.15,
  newUser: 0.05,
};

export class BehaviorAnalytics {
  private readonly _clock: IClock;
  private readonly _weights: UbaWeights;
  private readonly _profiles = new Map<string, UserProfile>();

  constructor(clock: IClock = new SystemClock(), weights: UbaWeights = DEFAULT_UBA_WEIGHTS) {
    this._clock = clock;
    this._weights = weights;
  }

  /**
   * Learn from one historical event. Call this for every event (the
   * baseline is a running tally, not a trained model).
   */
  observe(e: NormalizedEvent): void {
    const user = e.user;
    if (!user) return;
    const p = this._profile(user, e.timestampMs);
    p.total += 1;
    p.lastSeenMs = Math.max(p.lastSeenMs, e.timestampMs);
    if (e.action) p.actions.set(e.action, (p.actions.get(e.action) ?? 0) + 1);
    const hour = new Date(e.timestampMs).getUTCHours();
    p.hours[hour] = (p.hours[hour] ?? 0) + 1;
    if (e.sourceIp) {
      if (p.ips.size < MAX_KNOWN_IPS || p.ips.has(e.sourceIp)) p.ips.add(e.sourceIp);
    }
    // Per-minute burst counter.
    const minute = Math.floor(e.timestampMs / 60_000);
    if (minute === p.recentMinuteMs) p.recentCount += 1;
    else {
      p.recentMinuteMs = minute;
      p.recentCount = 1;
    }
  }

  /**
   * Score an event against the learned baseline. Does NOT mutate the
   * profile — call `observe` separately so scoring and learning can be
   * staged (score first, then fold into baseline).
   */
  score(e: NormalizedEvent): DeviationScore {
    const user = e.user ?? '(unknown)';
    const p = this._profiles.get(user);
    if (!p || p.total < MIN_EVENTS_FOR_BASELINE) {
      return {
        user,
        score: this._weights.newUser,
        factors: [{ factor: 'new-user', weight: this._weights.newUser, detail: 'insufficient baseline' }],
      };
    }
    const factors: DeviationFactor[] = [];

    // 1. Source IP novelty.
    if (e.sourceIp && !p.ips.has(e.sourceIp)) {
      factors.push({
        factor: 'new-ip',
        weight: this._weights.newIp,
        detail: `first event from ${e.sourceIp} (known: ${p.ips.size} ips)`,
      });
    }

    // 2. Hour-of-day rarity: compare this hour's share vs uniform 1/24.
    const hour = new Date(e.timestampMs).getUTCHours();
    const hourShare = (p.hours[hour] ?? 0) / p.total;
    if (hourShare < 1 / (HOURS * 2)) {
      // active < half the uniform rate → unusual hour
      factors.push({
        factor: 'unusual-hour',
        weight: this._weights.unusualHour * (1 - hourShare * HOURS * 2),
        detail: `hour ${hour}UTC share ${(hourShare * 100).toFixed(1)}%`,
      });
    }

    // 3. Action rarity.
    if (e.action) {
      const count = p.actions.get(e.action) ?? 0;
      const share = count / p.total;
      if (share < 0.02) {
        factors.push({
          factor: 'unusual-action',
          weight: this._weights.unusualAction * (1 - share * 50),
          detail: `"${e.action}" share ${(share * 100).toFixed(1)}% of user's events`,
        });
      }
    }

    // 4. Burst: recent per-minute count vs lifetime average/minute.
    const spanMin = Math.max((p.lastSeenMs - p.firstSeenMs) / 60_000, 1);
    const avgPerMin = p.total / spanMin;
    if (p.recentCount > Math.max(avgPerMin * 5, 10)) {
      factors.push({
        factor: 'burst',
        weight: this._weights.burst,
        detail: `${p.recentCount} events in current minute (avg ${avgPerMin.toFixed(2)}/min)`,
      });
    }

    const score = Math.min(
      factors.reduce((s, f) => s + Math.max(f.weight, 0), 0),
      1,
    );
    return { user, score, factors };
  }

  /** Snapshot the learned baseline for a user. */
  baseline(user: string): UserBaseline | undefined {
    const p = this._profiles.get(user);
    if (!p) return undefined;
    const actions: Record<string, number> = {};
    for (const [a, n] of p.actions) actions[a] = n;
    return {
      user,
      firstSeenMs: p.firstSeenMs,
      lastSeenMs: p.lastSeenMs,
      totalEvents: p.total,
      actions,
      hourHistogram: [...p.hours],
      knownIps: [...p.ips].sort(),
    };
  }

  /** score + observe in one step for streaming pipelines. */
  ingest(e: NormalizedEvent): DeviationScore {
    const s = this.score(e);
    this.observe(e);
    return s;
  }

  private _profile(user: string, atMs: number): UserProfile {
    let p = this._profiles.get(user);
    if (!p) {
      p = {
        firstSeenMs: atMs,
        lastSeenMs: atMs,
        total: 0,
        actions: new Map(),
        hours: new Array<number>(HOURS).fill(0),
        ips: new Set(),
        recentMinuteMs: -1,
        recentCount: 0,
      };
      this._profiles.set(user, p);
    }
    return p;
  }
}
