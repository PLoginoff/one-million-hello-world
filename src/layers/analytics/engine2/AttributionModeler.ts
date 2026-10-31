/**
 * Multi-Touch Attribution Modeler
 *
 * Distributes conversion credit across a subject's marketing
 * touchpoint journey under a chosen model:
 *
 *  - first-touch    — 100% to the earliest touch in the lookback window
 *  - last-touch     — 100% to the latest touch before conversion
 *  - linear         — 1/N to every touch
 *  - time-decay     — weight w_i = 2^(-age_i / halfLife), normalized;
 *                     the standard exponential-decay model where a
 *                     touch half-life ago earns half the weight of a
 *                     touch at conversion time
 *  - position-based — 40% first + 40% last + 20% divided over the
 *                     middle touches (U-shaped); with a single touch
 *                     it earns 100%; with two touches they split 50/50
 *
 * Journeys are stored per subject, kept sorted by touch time so
 * lookback filtering is a binary search, not a scan.
 *
 * Complexity:
 *  - addTouch():   O(log J) amortized (append) + O(J) worst on
 *                  out-of-order inserts
 *  - attribute():  O(J + C) per report; binary search per conversion
 *                  for the window cutoff.
 *
 * @module AnalyticsLayer/Engine2
 */

import {
  AttributionModel,
  AttributionOptions,
  AttributionReport,
  Conversion,
  CreditShare,
  Touchpoint,
} from './types';

const DEFAULT_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000;

interface Journey {
  /** Touchpoints kept sorted ascending by timestamp. */
  touches: Touchpoint[];
  conversions: Conversion[];
}

/** Lower-bound binary search: first index with touches[i].timestamp >= t. */
function lowerBound(touches: readonly Touchpoint[], t: number): number {
  let lo = 0;
  let hi = touches.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (touches[mid]!.timestamp < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Upper-bound: first index with touches[i].timestamp >= t (exclusive end). */
function upperBoundExclusive(touches: readonly Touchpoint[], t: number): number {
  let lo = 0;
  let hi = touches.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (touches[mid]!.timestamp < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Raw (unnormalized) weight per eligible touch under the model.
 * For first/last touch all weight sits on one index.
 */
function weights(
  model: AttributionModel,
  touches: readonly Touchpoint[],
  conversionTs: number,
  halfLifeMs: number
): number[] {
  const n = touches.length;
  const w = new Array<number>(n).fill(0);
  if (n === 0) return w;

  switch (model) {
    case 'first-touch':
      w[0] = 1;
      return w;
    case 'last-touch':
      w[n - 1] = 1;
      return w;
    case 'linear':
      return w.fill(1);
    case 'time-decay':
      for (let i = 0; i < n; i++) {
        const age = Math.max(0, conversionTs - touches[i]!.timestamp);
        w[i] = Math.pow(2, -age / halfLifeMs);
      }
      return w;
    case 'position-based':
      if (n === 1) {
        w[0] = 1;
      } else if (n === 2) {
        w[0] = 0.5;
        w[1] = 0.5;
      } else {
        w[0] = 0.4;
        w[n - 1] = 0.4;
        const middle = 0.2 / (n - 2);
        for (let i = 1; i < n - 1; i++) w[i] = middle;
      }
      return w;
  }
}

export class AttributionModeler {
  private readonly journeys = new Map<string, Journey>();
  private readonly halfLifeMs: number;
  private readonly lookbackMs: number;

  constructor(options: AttributionOptions = {}) {
    this.halfLifeMs = options.halfLifeMs ?? DEFAULT_HALF_LIFE_MS;
    if (this.halfLifeMs <= 0) throw new Error('halfLifeMs must be positive');
    this.lookbackMs = options.lookbackMs ?? 0;
    if (this.lookbackMs < 0) throw new Error('lookbackMs must be >= 0');
  }

  /**
   * Append a touchpoint to a subject's journey. Touches usually
   * arrive in time order (O(1) append); out-of-order touches are
   * spliced into sorted position (O(J)).
   */
  addTouch(subjectId: string, touch: Touchpoint): void {
    const j = this.journey(subjectId);
    const t = j.touches;
    if (t.length === 0 || t[t.length - 1]!.timestamp <= touch.timestamp) {
      t.push(touch);
      return;
    }
    // Insert before the first later touch (stable for equal times).
    let i = t.length - 1;
    while (i >= 0 && t[i]!.timestamp > touch.timestamp) i--;
    t.splice(i + 1, 0, touch);
  }

  /** Record a conversion for a subject. */
  addConversion(subjectId: string, conversion: Conversion): void {
    this.journey(subjectId).conversions.push({ ...conversion });
  }

  /**
   * Touches eligible to claim credit for `conversionTs`: strictly
   * before the conversion and inside the lookback window.
   */
  eligibleTouches(subjectId: string, conversionTs: number): readonly Touchpoint[] {
    const j = this.journeys.get(subjectId);
    if (!j) return [];
    const t = j.touches;
    const from = this.lookbackMs > 0 ? conversionTs - this.lookbackMs : Number.NEGATIVE_INFINITY;
    const lo = this.lookbackMs > 0 ? lowerBound(t, from) : 0;
    const hi = upperBoundExclusive(t, conversionTs);
    return t.slice(lo, hi);
  }

  /**
   * Attribute all recorded conversions for `subjectId` under `model`.
   * Returns the per-channel credit table.
   */
  attribute(subjectId: string, model: AttributionModel): AttributionReport {
    const j = this.journeys.get(subjectId);
    const conversions = j?.conversions ?? [];
    return this.attributeConversions(subjectId, conversions, model);
  }

  /**
   * Attribute a global report across every subject — the shape a
   * marketing dashboard consumes. Each subject's conversions are
   * attributed against its own journey.
   */
  attributeAll(model: AttributionModel): AttributionReport {
    const acc = new Map<string, { credit: number; value: number }>();
    let attributed = 0;
    let unattributed = 0;
    let totalValue = 0;

    for (const [subjectId, j] of this.journeys) {
      for (const c of j.conversions) {
        const touches = this.eligibleTouches(subjectId, c.timestamp);
        if (touches.length === 0) {
          unattributed++;
          continue;
        }
        attributed++;
        const w = weights(model, touches, c.timestamp, this.halfLifeMs);
        const wSum = w.reduce((a, b) => a + b, 0);
        const value = c.value ?? 1;
        totalValue += value;
        for (let i = 0; i < touches.length; i++) {
          const credit = w[i]! / wSum;
          const channel = touches[i]!.channel;
          const cur = acc.get(channel) ?? { credit: 0, value: 0 };
          cur.credit += credit;
          cur.value += credit * value;
          acc.set(channel, cur);
        }
      }
    }
    return this.report(model, acc, attributed, unattributed, totalValue);
  }

  /** Touch count for a subject (post-insert). */
  touchCount(subjectId: string): number {
    return this.journeys.get(subjectId)?.touches.length ?? 0;
  }

  /** Forget a subject entirely (GDPR erasure support). */
  forget(subjectId: string): boolean {
    return this.journeys.delete(subjectId);
  }

  private attributeConversions(
    subjectId: string,
    conversions: readonly Conversion[],
    model: AttributionModel
  ): AttributionReport {
    const acc = new Map<string, { credit: number; value: number }>();
    let attributed = 0;
    let unattributed = 0;
    let totalValue = 0;

    for (const c of conversions) {
      const touches = this.eligibleTouches(subjectId, c.timestamp);
      if (touches.length === 0) {
        unattributed++;
        continue;
      }
      attributed++;
      const w = weights(model, touches, c.timestamp, this.halfLifeMs);
      const wSum = w.reduce((a, b) => a + b, 0);
      const value = c.value ?? 1;
      totalValue += value;
      for (let i = 0; i < touches.length; i++) {
        const credit = w[i]! / wSum;
        const channel = touches[i]!.channel;
        const cur = acc.get(channel) ?? { credit: 0, value: 0 };
        cur.credit += credit;
        cur.value += credit * value;
        acc.set(channel, cur);
      }
    }
    return this.report(model, acc, attributed, unattributed, totalValue);
  }

  private report(
    model: AttributionModel,
    acc: Map<string, { credit: number; value: number }>,
    attributed: number,
    unattributed: number,
    totalValue: number
  ): AttributionReport {
    const creditTotal = [...acc.values()].reduce((a, c) => a + c.credit, 0);
    const channels: CreditShare[] = [...acc.entries()]
      .map(([channel, c]) => ({
        channel,
        credit: c.credit,
        value: c.value,
        share: creditTotal > 0 ? c.credit / creditTotal : 0,
      }))
      .sort((a, b) => b.credit - a.credit || (a.channel < b.channel ? -1 : 1));
    return {
      model,
      conversionsAttributed: attributed,
      conversionsUnattributed: unattributed,
      totalValue,
      channels,
    };
  }

  private journey(subjectId: string): Journey {
    let j = this.journeys.get(subjectId);
    if (!j) {
      j = { touches: [], conversions: [] };
      this.journeys.set(subjectId, j);
    }
    return j;
  }
}
