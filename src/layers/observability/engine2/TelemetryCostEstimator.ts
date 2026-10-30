/**
 * Telemetry Cost Estimator — per-signal volume → projected spend.
 *
 * Feeds on observed signal volumes (counts + bytes over a measured
 * window) and a linear `SignalPricing` table, then projects hourly /
 * daily cost. The estimator also accepts live signals so a router tap
 * can count volume in-line without a separate meter:
 *
 *   router sink ──► estimator.ingest(signal) ──► estimate()
 *
 * Cost answers the question ops actually asks: "which signal kind is
 * eating the budget?" — `shareOfTotal` per line gives the ranking.
 *
 * @module ObservabilityLayer/Engine2
 */

import { IClock, SignalKind, SystemClock, TelemetrySignal } from '../engine/signals';
import {
  CostEstimate,
  CostLine,
  DEFAULT_PRICING,
  SignalPricing,
  SignalVolume,
} from './types';

const HOUR_MS = 3_600_000;

interface WindowCounter {
  units: number;
  bytes: number;
  firstMs?: number;
  lastMs?: number;
}

export class TelemetryCostEstimator {
  private readonly _pricing: SignalPricing;
  private readonly _clock: IClock;
  private readonly _counters = new Map<SignalKind, WindowCounter>();

  constructor(pricing: SignalPricing = DEFAULT_PRICING, clock: IClock = new SystemClock()) {
    this._pricing = pricing;
    this._clock = clock;
  }

  /**
   * Count one telemetry signal in the live window. Byte accounting:
   *  - log: body length + serialized attribute size (the billed payload)
   *  - span/metric: flat per-unit price, bytes tracked as 0
   */
  ingest(signal: TelemetrySignal & { body?: string }): void {
    const c = this._counter(signal.kind);
    const now = signal.timestampMs ?? this._clock.nowMs();
    c.units += 1;
    if (signal.kind === 'log') {
      c.bytes += (signal.body?.length ?? 0) + roughAttrsBytes(signal.attributes);
    }
    if (c.firstMs === undefined || now < c.firstMs) c.firstMs = now;
    if (c.lastMs === undefined || now > c.lastMs) c.lastMs = now;
  }

  /** Report externally-metered volume (e.g. from a billing export). */
  report(volume: SignalVolume): void {
    const c = this._counter(volume.kind);
    c.units += volume.units;
    c.bytes += volume.bytes;
    const end = this._clock.nowMs();
    const start = end - volume.windowMs;
    if (c.firstMs === undefined || start < c.firstMs) c.firstMs = start;
    if (c.lastMs === undefined || end > c.lastMs) c.lastMs = end;
  }

  /**
   * Build the cost estimate over the observed window. The window is
   * `first..last` across all counters; degenerate single-point windows
   * are treated as 1ms to keep per-hour projections finite.
   */
  estimate(nowMs?: number): CostEstimate {
    const now = nowMs ?? this._clock.nowMs();
    let first = Infinity;
    let last = -Infinity;
    for (const c of this._counters.values()) {
      if (c.firstMs !== undefined) first = Math.min(first, c.firstMs);
      if (c.lastMs !== undefined) last = Math.max(last, c.lastMs);
    }
    const windowMs = first === Infinity ? 0 : Math.max(last - first, 1);

    const lines: CostLine[] = [];
    let total = 0;
    let perHour = 0;
    for (const kind of ['metric', 'log', 'trace'] as SignalKind[]) {
      const c = this._counters.get(kind);
      const units = c?.units ?? 0;
      const bytes = c?.bytes ?? 0;
      const cost = this._costOf(kind, units, bytes);
      const unitsPerHour = windowMs > 0 ? (units / windowMs) * HOUR_MS : 0;
      const costPerHour = windowMs > 0 ? (cost / windowMs) * HOUR_MS : 0;
      total += cost;
      perHour += costPerHour;
      lines.push({
        kind,
        units,
        unitsPerHour,
        cost,
        costPerHour,
        shareOfTotal: 0, // filled below once total is known
      });
    }
    for (const l of lines) {
      (l as { shareOfTotal: number }).shareOfTotal = total === 0 ? 0 : l.cost / total;
    }
    return {
      nowMs: now,
      windowMs,
      lines,
      totalCost: total,
      projectedCostPerHour: perHour,
      projectedCostPerDay: perHour * 24,
    };
  }

  /** Reset all counters (new billing window). */
  reset(): void {
    this._counters.clear();
  }

  private _counter(kind: SignalKind): WindowCounter {
    let c = this._counters.get(kind);
    if (!c) {
      c = { units: 0, bytes: 0 };
      this._counters.set(kind, c);
    }
    return c;
  }

  private _costOf(kind: SignalKind, units: number, bytes: number): number {
    const p = this._pricing;
    switch (kind) {
      case 'metric':
        return units * p.perMetricPoint;
      case 'log':
        return units * p.perLogRecord + bytes * p.perLogByte;
      case 'trace':
        return units * p.perSpan;
    }
  }
}

/** Approximate serialized size of an attribute map (log billing payload). */
function roughAttrsBytes(attrs: Record<string, unknown> | undefined): number {
  if (!attrs) return 0;
  let n = 0;
  for (const k of Object.keys(attrs)) {
    n += k.length + String(attrs[k]).length + 4; // quotes + separators
  }
  return n;
}
