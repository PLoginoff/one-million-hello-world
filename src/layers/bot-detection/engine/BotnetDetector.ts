/**
 * BotnetDetector — correlated-request detection across IPs.
 *
 * A single bot is caught by per-IP signals; a *botnet* rotates IPs
 * specifically to defeat those signals. The tell is correlation:
 * 10,000 residential IPs sharing the same rare fingerprint hitting
 * the same endpoint in the same minute is not organic traffic.
 *
 * Detection model: per fingerprint-value we keep a sliding-window
 * log of (ip, timestamp). A cluster is suspicious when:
 *   - many DISTINCT IPs share it within the window (IP churn), and
 *   - request cadence is regular (correlated timing).
 *
 * Score = ipCount factor × regularity factor. Fingerprint alone is
 * meaningless for NAT'd humans — a Chrome/Windows fingerprint is
 * shared by millions of *legit* users — so the score is only
 * meaningful when the fingerprint is *rare* (callers supply
 * `globalFrequency`; we discount score by it).
 *
 * @module BotDetectionLayer/Engine
 */

import { BotClock, CorrelatedCluster, SystemBotClock } from './types';

export interface BotnetOptions {
  /** correlation window in ms. Default 60s. */
  readonly windowMs?: number;
  /** distinct IPs in the window to be flagged. Default 5. */
  readonly minIps?: number;
}

interface FpLog {
  /** ip → last seen ts */
  ips: Map<string, number>;
  /** timestamps within window (for regularity) */
  times: number[];
}

export class BotnetDetector {
  private readonly _windowMs: number;
  private readonly _minIps: number;
  private readonly _clock: BotClock;
  private readonly _fps: Map<string, FpLog>;

  constructor(options: BotnetOptions = {}, clock?: BotClock) {
    this._windowMs = options.windowMs ?? 60_000;
    this._minIps = options.minIps ?? 5;
    this._clock = clock ?? new SystemBotClock();
    this._fps = new Map();
  }

  /** Record a request (fingerprint + ip + timestamp). */
  observe(fingerprint: string, ip: string, at?: number): void {
    const t = at ?? this._clock.now();
    let log = this._fps.get(fingerprint);
    if (log === undefined) {
      log = { ips: new Map(), times: [] };
      this._fps.set(fingerprint, log);
    }
    log.ips.set(ip, t);
    // keep times sorted (events mostly arrive in order)
    const idx = upperBound(log.times, t);
    log.times.splice(idx, 0, t);
    this._trim(log, t);
  }

  /**
   * Cluster report for one fingerprint within the current window.
   * `globalFrequency` is the fingerprint's share of all traffic
   * (0..1) — common fingerprints are discounted.
   */
  cluster(fingerprint: string, globalFrequency = 0.001): CorrelatedCluster | undefined {
    const log = this._fps.get(fingerprint);
    if (log === undefined) return undefined;
    const now = this._clock.now();
    this._trim(log, now);
    if (log.ips.size < this._minIps) return undefined;

    // Regularity: CV of inter-request gaps. Bots correlate; humans don't.
    const gaps: number[] = [];
    for (let i = 1; i < log.times.length; i++) {
      gaps.push(log.times[i] - log.times[i - 1]);
    }
    const regularity = 1 - Math.min(1, cv(gaps));

    // Rare fingerprints are stronger evidence.
    const rarity = 1 - Math.min(1, globalFrequency * 10);

    const score = Math.min(
      1,
      0.4 * Math.min(1, log.ips.size / (this._minIps * 4)) +
        0.4 * regularity +
        0.2 * rarity
    );
    return {
      fingerprint,
      ips: [...log.ips.keys()].sort(),
      requests: log.times.length,
      score,
    };
  }

  /** All fingerprints currently over the IP threshold. */
  suspiciousClusters(): CorrelatedCluster[] {
    const out: CorrelatedCluster[] = [];
    for (const fp of this._fps.keys()) {
      const c = this.cluster(fp);
      if (c !== undefined) out.push(c);
    }
    out.sort((a, b) => b.score - a.score);
    return out;
  }

  /** Number of fingerprints tracked. */
  get fingerprintCount(): number {
    return this._fps.size;
  }

  /* ---------------------------------------------------------------- */

  /** Drop entries older than the window. */
  private _trim(log: FpLog, now: number): void {
    const cutoff = now - this._windowMs;
    const idx = lowerBound(log.times, cutoff);
    if (idx > 0) log.times.splice(0, idx);
    for (const [ip, t] of log.ips) {
      if (t < cutoff) log.ips.delete(ip);
    }
  }
}

function cv(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((s, v) => s + v, 0) / xs.length;
  if (m === 0) return 0;
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length;
  return Math.sqrt(v) / m;
}

function lowerBound(a: readonly number[], t: number): number {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (a[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function upperBound(a: readonly number[], t: number): number {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (a[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
