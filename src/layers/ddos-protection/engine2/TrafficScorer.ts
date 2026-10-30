/**
 * Traffic Scorer — per-IP risk dashboard data.
 *
 * Maintains a decaying risk score per source IP, fed by per-window
 * observations (volume, detector flags, challenge failures). Scores
 * persist between windows via exponential decay so a burst raises risk
 * quickly but forgiveness is automatic once behaviour normalises —
 * the score half-life replaces the usual "block for N minutes" timer
 * with something proportional.
 *
 * Score model (per window):
 *
 *   points = w_req·log1p(requests / expectedPerIp)          (volume burst)
 *          + w_flag·flagged                                  (detector hits)
 *          + w_chal·challengeFailed                          (failed PoW/captcha)
 *
 *   score += points; score *= decay^(Δt)                    (exponential decay)
 *
 *   log1p squashes volume so a 10× burst doesn't linearly dominate a
 *   corroborating detector flag — corroboration > raw volume.
 *
 * Storage: per-IP ring buffer of recent points (bounded history for the
 * dashboard) + running totals. Evicts IPs that decay to ~0 and stay
 * quiet — keeps memory O(active attackers), not O(all-time IPs).
 *
 * Complexity: O(1) per observation, O(N log N) per snapshot (top-N sort).
 *
 * @module DdosProtectionLayer/Engine2
 */

import {
  DashboardSnapshot,
  IClock,
  IpObservation,
  IpRiskRow,
  RiskScorePoint,
  SystemClock,
} from './types';

export interface TrafficScorerConfig {
  /** Score half-life in ms — score halves every this long. Default 5min. */
  readonly halfLifeMs?: number;
  /** Weight of the log-volume component. Default 10. */
  readonly volumeWeight?: number;
  /** Points added per flagged window. Default 25. */
  readonly flagWeight?: number;
  /** Points added per challenge failure. Default 30. */
  readonly challengeWeight?: number;
  /** Expected per-IP requests/window for normalisation. Default 20. */
  readonly expectedRequestsPerIp?: number;
  /** Score below which an idle IP is evicted. Default 1. */
  readonly evictionFloor?: number;
  /** Score decayed to this after silence is pruned from history. Default 0.05. */
  readonly pruneFloor?: number;
  /** Max history points kept per IP. Default 50. */
  readonly historyLimit?: number;
  /** IPs kept in the snapshot top list. Default 20. */
  readonly topN?: number;
}

interface IpState {
  score: number;
  lastAt: number;
  firstSeen: number;
  lastSeen: number;
  flaggedWindows: number;
  history: RiskScorePoint[];
}

const DAY = 24 * 60 * 60 * 1000;

export class TrafficScorer {
  private readonly _clock: IClock;
  private readonly _halfLife: number;
  private readonly _wVol: number;
  private readonly _wFlag: number;
  private readonly _wChal: number;
  private readonly _expected: number;
  private readonly _evictFloor: number;
  private readonly _pruneFloor: number;
  private readonly _histLimit: number;
  private readonly _topN: number;

  private readonly _ips = new Map<string, IpState>();

  constructor(config: TrafficScorerConfig = {}, clock: IClock = new SystemClock()) {
    this._clock = clock;
    this._halfLife = config.halfLifeMs ?? 5 * 60 * 1000;
    this._wVol = config.volumeWeight ?? 10;
    this._wFlag = config.flagWeight ?? 25;
    this._wChal = config.challengeWeight ?? 30;
    this._expected = config.expectedRequestsPerIp ?? 20;
    this._evictFloor = config.evictionFloor ?? 1;
    this._pruneFloor = config.pruneFloor ?? 0.05;
    this._histLimit = config.historyLimit ?? 50;
    this._topN = config.topN ?? 20;
  }

  /**
   * Feed one window of per-IP observations. Scores update in place and
   * decay from the IP's own last-update time — IPs that skip a window
   * still decay correctly when next seen (lazy decay).
   */
  observe(observations: readonly IpObservation[]): void {
    const now = this._clock.now();
    for (const obs of observations) {
      let st = this._ips.get(obs.ip);
      if (!st) {
        st = {
          score: 0,
          lastAt: obs.at,
          firstSeen: obs.at,
          lastSeen: obs.at,
          flaggedWindows: 0,
          history: [],
        };
        this._ips.set(obs.ip, st);
      }

      // Decay from the last touch to *this* observation's timestamp.
      st.score = this._decayed(st.score, st.lastAt, obs.at);
      st.lastAt = obs.at;
      st.lastSeen = obs.at;

      const components: Record<string, number> = {
        volume: this._wVol * Math.log1p(obs.requests / Math.max(1, this._expected)),
        flagged: obs.flagged ? this._wFlag : 0,
        challenge: obs.challengeFailed ? this._wChal : 0,
      };
      const points = components.volume + components.flagged + components.challenge;
      if (obs.flagged) st.flaggedWindows += 1;
      st.score = Math.min(100, st.score + points);

      st.history.push({ at: obs.at, score: st.score, components });
      if (st.history.length > this._histLimit) {
        st.history.splice(0, st.history.length - this._histLimit);
      }
    }

    // Housekeeping: drop decayed-to-nothing idle IPs so long runs don't
    // accumulate one record per IP ever seen. O(tracked IPs), cheap.
    for (const [ip, st] of this._ips) {
      const decayed = this._decayed(st.score, st.lastAt, now);
      if (decayed < this._evictFloor && now - st.lastSeen > this._halfLife * 4) {
        this._ips.delete(ip);
      }
    }
  }

  /** Current (decayed-to-now) risk score for one IP, 0..100. */
  score(ip: string): number {
    const st = this._ips.get(ip);
    if (!st) return 0;
    return this._decayed(st.score, st.lastAt, this._clock.now());
  }

  /** The riskiest IPs plus fleet-level aggregates — dashboard payload. */
  snapshot(highRiskCutoff = 50): DashboardSnapshot {
    const now = this._clock.now();
    const rows: IpRiskRow[] = [];
    let sum = 0;
    let highRisk = 0;

    for (const [ip, st] of this._ips) {
      const current = this._decayed(st.score, st.lastAt, now);
      sum += current;
      if (current >= highRiskCutoff) highRisk += 1;
      rows.push({
        ip,
        currentScore: current,
        trend: this._trend(st.history),
        history: this._prunedHistory(st.history),
        flaggedWindows: st.flaggedWindows,
        firstSeen: st.firstSeen,
        lastSeen: st.lastSeen,
      });
    }

    rows.sort((a, b) => b.currentScore - a.currentScore);
    return {
      generatedAt: now,
      topIps: rows.slice(0, this._topN),
      highRiskCount: highRisk,
      meanScore: rows.length > 0 ? sum / rows.length : 0,
    };
  }

  /** Tracked IP count (post-eviction). */
  trackedIps(): number {
    return this._ips.size;
  }

  /* ---------------------------------------------------------------- */

  /**
   * Exponential decay: score(t) = score₀ · 2^(−Δt/halfLife).
   * Equivalent to `Math.exp(-λ·Δt)` with λ = ln2/halfLife.
   */
  private _decayed(score: number, from: number, to: number): number {
    const dt = Math.max(0, Math.min(to - from, 30 * DAY)); // clamp insanity
    if (dt === 0 || score === 0) return score;
    return score * Math.pow(0.5, dt / this._halfLife);
  }

  /**
   * Trend from recent history slope: compare mean of the last third of
   * points to the mean of the first third — robust to single spikes.
   */
  private _trend(history: readonly RiskScorePoint[]): 'rising' | 'falling' | 'stable' {
    if (history.length < 4) return 'stable';
    const third = Math.max(1, Math.floor(history.length / 3));
    const head = history.slice(0, third);
    const tail = history.slice(history.length - third);
    const headMean = head.reduce((a, p) => a + p.score, 0) / head.length;
    const tailMean = tail.reduce((a, p) => a + p.score, 0) / tail.length;
    const delta = tailMean - headMean;
    if (delta > 5) return 'rising';
    if (delta < -5) return 'falling';
    return 'stable';
  }

  /** Drop leading history points that decayed to ~0 — keeps payloads tight. */
  private _prunedHistory(history: readonly RiskScorePoint[]): RiskScorePoint[] {
    const now = this._clock.now();
    let start = 0;
    while (start < history.length && this._decayed(history[start].score, history[start].at, now) < this._pruneFloor) {
      start++;
    }
    return history.slice(start);
  }
}
