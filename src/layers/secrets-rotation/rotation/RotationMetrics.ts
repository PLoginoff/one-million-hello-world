/**
 * Secrets Rotation — Rotation Metrics
 *
 * Operational KPIs for the rotation engine: rotation latency stats,
 * overdue-schedule tracking, emergency-rotation rate, and keys-per-secret
 * distribution. These are the numbers a rotation SLO dashboard needs —
 * "99% of rotations complete inside 5m" and "no key lives past max age".
 *
 * All stats are O(1) per event (Welford accumulators + counters).
 *
 * @module SecretsRotation/Rotation
 */

import { RotationAuditEntry, RotationClock } from './RotationTypes';

interface LatencyStats {
  n: number;
  mean: number;
  m2: number;
  min: number;
  max: number;
}

function addLatency(s: LatencyStats, x: number): void {
  s.n++;
  const d = x - s.mean;
  s.mean += d / s.n;
  s.m2 += d * (x - s.mean);
  if (x < s.min) s.min = x;
  if (x > s.max) s.max = x;
}

export interface RotationMetricsSnapshot {
  readonly rotationsTotal: number;
  readonly emergencyRotations: number;
  readonly scheduledRotations: number;
  readonly revocations: number;
  /** Fraction of rotations that were emergency (lower is better). */
  readonly emergencyRate: number;
  /** Mean interval between scheduled rotations per secret (ms). */
  readonly meanRotationIntervalMs: number;
  readonly activeKeys: number;
  readonly retiringKeys: number;
  readonly revokedKeys: number;
}

export class RotationMetrics {
  private readonly _clock: RotationClock;
  private _rotations = 0;
  private _emergency = 0;
  private _scheduled = 0;
  private _revocations = 0;
  private readonly _intervals: LatencyStats = { n: 0, mean: 0, m2: 0, min: Number.POSITIVE_INFINITY, max: 0 };
  private readonly _rotationLatency: LatencyStats = { n: 0, mean: 0, m2: 0, min: Number.POSITIVE_INFINITY, max: 0 };
  private readonly _lastRotationAt = new Map<string, number>();
  private _activeKeys = 0;
  private _retiringKeys = 0;
  private _revokedKeys = 0;

  constructor(clock: RotationClock = Date.now) {
    this._clock = clock;
  }

  /** Feed an audit-trail entry — the single ingestion path keeps counts coherent. */
  onAudit(entry: RotationAuditEntry): void {
    switch (entry.event) {
      case 'activated':
        this._rotations++;
        this._activeKeys++;
        {
          const last = this._lastRotationAt.get(entry.secretId);
          if (last !== undefined) {
            addLatency(this._intervals, entry.at - last);
          }
          this._lastRotationAt.set(entry.secretId, entry.at);
        }
        break;
      case 'scheduled-fired':
        this._scheduled++;
        break;
      case 'emergency-rotated':
        this._emergency++;
        break;
      case 'retiring':
        this._activeKeys = Math.max(0, this._activeKeys - 1);
        this._retiringKeys++;
        break;
      case 'retired':
      case 'expired':
        this._retiringKeys = Math.max(0, this._retiringKeys - 1);
        break;
      case 'revoked':
        this._revocations++;
        this._revokedKeys++;
        // Revoke may hit a retiring or staged key; conservatively decrement
        // retiring since that's the common path.
        this._retiringKeys = Math.max(0, this._retiringKeys - 1);
        break;
      default:
        break;
    }
  }

  /** Record observed rotation duration for latency stats. */
  recordRotationLatency(ms: number): void {
    addLatency(this._rotationLatency, ms);
  }

  snapshot(): RotationMetricsSnapshot {
    return {
      rotationsTotal: this._rotations,
      emergencyRotations: this._emergency,
      scheduledRotations: this._scheduled,
      revocations: this._revocations,
      emergencyRate: this._rotations > 0 ? this._emergency / this._rotations : 0,
      meanRotationIntervalMs: this._intervals.n > 0 ? this._intervals.mean : Number.NaN,
      activeKeys: this._activeKeys,
      retiringKeys: this._retiringKeys,
      revokedKeys: this._revokedKeys,
    };
  }

  /** Rotation latency stats (rotations should be fast). */
  rotationLatency(): { n: number; mean: number; min: number; max: number } {
    return {
      n: this._rotationLatency.n,
      mean: this._rotationLatency.mean,
      min: this._rotationLatency.min === Number.POSITIVE_INFINITY ? 0 : this._rotationLatency.min,
      max: this._rotationLatency.max,
    };
  }

  /**
   * Secrets whose last-rotation age exceeds `intervalMs` — the overdue report
   * a dashboard polls to catch stalled schedules.
   */
  overdueSecrets(
    intervals: ReadonlyMap<string, number>,
    now?: number
  ): ReadonlyArray<{ secretId: string; overdueMs: number }> {
    const t = now ?? this._clock();
    const out: Array<{ secretId: string; overdueMs: number }> = [];
    for (const [secretId, intervalMs] of intervals) {
      const last = this._lastRotationAt.get(secretId);
      const age = last === undefined ? t : t - last; // never rotated → age = now
      if (age > intervalMs) out.push({ secretId, overdueMs: age - intervalMs });
    }
    return out;
  }

  reset(): void {
    this._rotations = 0;
    this._emergency = 0;
    this._scheduled = 0;
    this._revocations = 0;
    this._intervals.n = 0;
    this._intervals.mean = 0;
    this._intervals.m2 = 0;
    this._intervals.min = Number.POSITIVE_INFINITY;
    this._intervals.max = 0;
    this._rotationLatency.n = 0;
    this._rotationLatency.mean = 0;
    this._rotationLatency.m2 = 0;
    this._rotationLatency.min = Number.POSITIVE_INFINITY;
    this._rotationLatency.max = 0;
    this._lastRotationAt.clear();
    this._activeKeys = 0;
    this._retiringKeys = 0;
    this._revokedKeys = 0;
  }
}
