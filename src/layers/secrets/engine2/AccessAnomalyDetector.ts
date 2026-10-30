/**
 * Secrets Engine2 — Access Anomaly Detection
 *
 * The audit log tells you WHO did WHAT; this detector flags WHEN an
 * access pattern looks wrong:
 *
 *   - VOLUME: per-principal request rate vs a Welford-trained baseline.
 *     A service reading 40× its mean rate is suspicious even if every
 *     individual call is legal.
 *   - NOVELTY: a principal touching a path for the FIRST time — legit
 *     during a rollout, suspicious in steady-state. Opt-in per path class
 *     via `novelPaths` (e.g. only prod secrets alert on first-touch).
 *   - OFF-HOURS: accesses in a configured hour band (e.g. 02:00–05:00
 *     local) flagged when the principal has no prior off-hours history.
 *   - ENUMERATION: > N distinct paths in a sliding window — the "read
 *     everything" pattern of a compromised credential.
 *
 * Baselines are Welford accumulators (mean + variance, O(1) update) —
 * online, no stored history. A z-score above `zThreshold` flags.
 *
 * Alerts carry a composite score and the contributing signals so triage
 * sees WHY, not just THAT.
 *
 * Complexity: O(1) per access; report O(signals).
 *
 * @module Secrets/Engine2
 */

import { AuditAction, AuditEntry, SecretsClock } from '../vault/SecretTypes';

export interface AnomalySignal {
  readonly kind: 'volume' | 'novel' | 'off-hours' | 'enumeration';
  readonly detail: string;
  /** Severity weight contributed to the alert score. */
  readonly weight: number;
}

export interface AccessAlert {
  readonly principal: string;
  readonly path: string;
  readonly at: number;
  readonly score: number;
  readonly signals: readonly AnomalySignal[];
}

export interface AnomalyOptions {
  readonly clock?: SecretsClock;
  /** z-score above this flags a volume anomaly (default 3). */
  readonly zThreshold?: number;
  /** Path prefixes where first-touch is anomalous (e.g. 'prod/'). */
  readonly novelPrefixes?: readonly string[];
  /** Off-hours band [startHour, endHour) local (default none). */
  readonly offHours?: readonly [number, number];
  /** Distinct paths in windowMs that flags enumeration (default 50). */
  readonly enumerationThreshold?: number;
  /** Enumeration sliding window (default 5 min). */
  readonly enumerationWindowMs?: number;
}

/** Welford online mean/variance — O(1) update, no history retained. */
class Welford {
  n = 0;
  mean = 0;
  m2 = 0;

  push(x: number): void {
    this.n++;
    const d = x - this.mean;
    this.mean += d / this.n;
    this.m2 += d * (x - this.mean);
  }

  get variance(): number {
    return this.n < 2 ? 0 : this.m2 / (this.n - 1);
  }

  get stddev(): number {
    return Math.sqrt(this.variance);
  }

  /** z-score of x under the current distribution. */
  z(x: number): number {
    const sd = this.stddev;
    return sd === 0 ? 0 : (x - this.mean) / sd;
  }
}

const Z_DEFAULT = 3;
const ENUM_DEFAULT = 50;
const ENUM_WINDOW = 5 * 60_000;

export class AccessAnomalyDetector {
  private readonly _clock: SecretsClock;
  private readonly _z: number;
  private readonly _novelPrefixes: readonly string[];
  private readonly _offHours: readonly [number, number] | null;
  private readonly _enumThreshold: number;
  private readonly _enumWindow: number;

  /** principal → per-minute-rate baseline. */
  private readonly _rates = new Map<string, Welford>();
  /** principal → minute-bucket → count (current minute volume). */
  private readonly _minuteCounts = new Map<string, Map<number, number>>();
  /** principal → paths ever seen. */
  private readonly _seen = new Map<string, Set<string>>();
  /** principal → [{path, at}] recent distinct-path touches. */
  private readonly _recent = new Map<string, Array<{ path: string; at: number }>>();
  /** principal → has prior off-hours access. */
  private readonly _offHoursOk = new Set<string>();
  private _alerts: AccessAlert[] = [];

  constructor(options?: AnomalyOptions) {
    this._clock = options?.clock ?? (() => Date.now());
    this._z = options?.zThreshold ?? Z_DEFAULT;
    this._novelPrefixes = options?.novelPrefixes ?? [];
    this._offHours = options?.offHours ?? null;
    this._enumThreshold = options?.enumerationThreshold ?? ENUM_DEFAULT;
    this._enumWindow = options?.enumerationWindowMs ?? ENUM_WINDOW;
  }

  /**
   * Feed one audit entry; returns an alert when signals cross the bar.
   * Non-read actions (write/delete) bypass volume baselining — an admin
   * writing secrets shouldn't train a "reads per minute" model.
   */
  observe(entry: Pick<AuditEntry, 'principal' | 'path' | 'action' | 'at'>): AccessAlert | null {
    const signals: AnomalySignal[] = [];
    const { principal, path } = entry;

    // --- novelty -----------------------------------------------------
    let seen = this._seen.get(principal);
    if (!seen) {
      seen = new Set();
      this._seen.set(principal, seen);
    }
    const firstTouch = !seen.has(path);
    if (firstTouch && this._novelPrefixes.some((p) => path.startsWith(p))) {
      signals.push({ kind: 'novel', detail: `first access to '${path}'`, weight: 2 });
    }
    seen.add(path);

    // --- enumeration --------------------------------------------------
    let recent = this._recent.get(principal);
    if (!recent) {
      recent = [];
      this._recent.set(principal, recent);
    }
    recent.push({ path, at: entry.at });
    const cutoff = entry.at - this._enumWindow;
    while (recent.length > 0 && recent[0].at < cutoff) recent.shift();
    const distinct = new Set(recent.map((r) => r.path)).size;
    if (distinct >= this._enumThreshold) {
      signals.push({
        kind: 'enumeration',
        detail: `${distinct} distinct paths in ${this._enumWindow}ms`,
        weight: 3,
      });
    }

    // --- off-hours ----------------------------------------------------
    if (this._offHours) {
      const hour = new Date(entry.at).getUTCHours();
      const [s, e] = this._offHours;
      const inBand = s <= e ? hour >= s && hour < e : hour >= s || hour < e;
      if (inBand && !this._offHoursOk.has(principal)) {
        signals.push({ kind: 'off-hours', detail: `access at UTC hour ${hour} in ${s}–${e}`, weight: 1 });
      }
      if (inBand) this._offHoursOk.add(principal); // subsequent off-hours OK
    }

    // --- volume --------------------------------------------------------
    if (entry.action === 'read' || entry.action === 'read-version') {
      const minute = Math.floor(entry.at / 60_000);
      let counts = this._minuteCounts.get(principal);
      if (!counts) {
        counts = new Map();
        this._minuteCounts.set(principal, counts);
      }
      const n = (counts.get(minute) ?? 0) + 1;
      counts.set(minute, n);
      // Baseline trains on COMPLETED minutes only — never on the live one.
      const w = this._rates.get(principal);
      // Once the baseline has seen ≥10 minutes, flag when n exceeds
      // mean + z·σ (Welford) OR — for the degenerate zero-variance
      // baseline — when the count is clearly off the trained rate.
      const anomalous =
        w !== undefined &&
        w.n >= 10 &&
        (w.stddev === 0 ? n > Math.max(w.mean * 2, w.mean + 5) : w.z(n) > this._z);
      if (anomalous && w) {
        signals.push({
          kind: 'volume',
          detail: `rate ${n}/min vs baseline ${w.mean.toFixed(1)}±${w.stddev.toFixed(1)} (z=${w.stddev === 0 ? 'inf' : w.z(n).toFixed(1)})`,
          weight: Math.min(5, w.stddev === 0 ? 5 : w.z(n) / this._z),
        });
      }
      // Fold completed minutes into the baseline lazily on next access.
      for (const [m, c] of counts) {
        if (m < minute) {
          let w2 = this._rates.get(principal);
          if (!w2) {
            w2 = new Welford();
            this._rates.set(principal, w2);
          }
          w2.push(c);
          counts.delete(m);
        }
      }
    }

    if (signals.length === 0) return null;
    const alert: AccessAlert = {
      principal,
      path,
      at: entry.at,
      score: signals.reduce((a, s) => a + s.weight, 0),
      signals,
    };
    this._alerts.push(alert);
    return alert;
  }

  alerts(principal?: string): readonly AccessAlert[] {
    return principal === undefined
      ? this._alerts
      : this._alerts.filter((a) => a.principal === principal);
  }

  /** Baseline summary for a principal (diagnostics). */
  baseline(principal: string): { n: number; mean: number; stddev: number } | null {
    const w = this._rates.get(principal);
    return w ? { n: w.n, mean: w.mean, stddev: w.stddev } : null;
  }
}

/** Feed an audit-log query result through the detector in seq order. */
export function replayAuditLog(
  entries: readonly AuditEntry[],
  detector: AccessAnomalyDetector
): AccessAlert[] {
  const out: AccessAlert[] = [];
  for (const e of [...entries].sort((a, b) => a.seq - b.seq)) {
    const a = detector.observe(e);
    if (a) out.push(a);
  }
  return out;
}
