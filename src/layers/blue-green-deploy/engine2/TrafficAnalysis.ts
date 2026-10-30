/**
 * Traffic Analysis During Switch
 *
 * Compares error rates between the blue and green windows around a
 * cutover — the quantitative answer to "is green worse than what we
 * had?" that a watchful human gives before declaring the switch done.
 *
 * The comparison is deliberately rate-based, not volume-based: green
 * usually takes a partial share during canary-style switchover, so raw
 * error counts mislead. Rates normalise the windows.
 *
 * Decision rule (hysteresis on the lift ratio):
 *   - green worse when errorRateDelta > `toleranceDelta` OR
 *     errorRateRatio > `maxRatio` — either an absolute jump or a
 *     relative lift counts, because each catches what the other misses
 *     (0.01%→5% is a ratio catch; 40%→45% is a delta catch).
 *   - blue.rate = 0 and green > 0 → Infinite lift, always worse.
 *   - Both empty windows → no signal, `stay` with reason 'no traffic'.
 *
 * Small windows get a min-requests floor before judgement — a 1-in-3
 * error burst on 3 requests should not auto-rollback a deploy.
 *
 * @module BlueGreenDeployLayer/Engine2
 */

import { TrafficComparison, TrafficWindow } from './types';

export interface TrafficPolicy {
  /** Absolute rate delta (fraction, e.g. 0.02 = 2pp) that marks green worse. */
  readonly toleranceDelta: number;
  /** Relative lift (e.g. 2.0 = twice the error rate) that marks green worse. */
  readonly maxRatio: number;
  /** Minimum green requests before any judgement is made. */
  readonly minRequests: number;
}

const DEFAULT_POLICY: TrafficPolicy = {
  toleranceDelta: 0.02,
  maxRatio: 2,
  minRequests: 50,
};

function rate(w: TrafficWindow): number {
  return w.requests === 0 ? 0 : w.errors / w.requests;
}

export function compareWindows(
  blue: TrafficWindow,
  green: TrafficWindow,
  policy: Partial<TrafficPolicy> = {}
): TrafficComparison {
  const p: TrafficPolicy = { ...DEFAULT_POLICY, ...policy };
  const bRate = rate(blue);
  const gRate = rate(green);
  const delta = gRate - bRate;
  const ratio = bRate === 0 ? null : gRate / bRate;
  const infiniteLift = bRate === 0 && gRate > 0;

  let greenWorse = false;
  let reason: string;
  let recommendation: 'stay' | 'rollback' = 'stay';

  if (green.requests < p.minRequests) {
    reason = `insufficient green traffic (${green.requests} < ${p.minRequests}) — no judgement`;
  } else if (infiniteLift) {
    greenWorse = true;
    reason = `blue had zero errors; green error rate is ${(gRate * 100).toFixed(2)}%`;
  } else if (delta > p.toleranceDelta) {
    greenWorse = true;
    reason = `error rate rose ${(delta * 100).toFixed(2)}pp (${(bRate * 100).toFixed(2)}% → ${(gRate * 100).toFixed(2)}%)`;
  } else if (ratio !== null && ratio > p.maxRatio) {
    greenWorse = true;
    reason = `error rate lifted ${ratio.toFixed(1)}× (${(bRate * 100).toFixed(2)}% → ${(gRate * 100).toFixed(2)}%)`;
  } else {
    reason = `within tolerance (${(bRate * 100).toFixed(2)}% → ${(gRate * 100).toFixed(2)}%)`;
  }

  if (greenWorse) recommendation = 'rollback';
  return {
    blue: { ...blue, errorRate: bRate },
    green: { ...green, errorRate: gRate },
    errorRateDelta: delta,
    errorRateRatio: ratio,
    greenWorse,
    recommendation,
    reason,
  };
}
