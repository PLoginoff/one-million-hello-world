/**
 * AdaptiveThresholds — per-merchant risk-tolerance tuning.
 *
 * A global flag/block cutoff is wrong twice: a luxury jeweler loses
 * more per missed fraud than a coffee shop, and a coffee shop loses
 * more per false decline (customer walks). This engine keeps an
 * independent threshold pair per merchant and nudges them from
 * *outcome feedback* — not scores alone:
 *
 *   - 'fraud-confirmed' on an approved tx → thresholds were too loose
 *     → both cutoffs step DOWN (catch more next time);
 *   - 'false-alarm' on a flagged/declined tx → too tight for this
 *     merchant's false-positive budget → cutoffs step UP;
 *   - 'clean' → gentle reversion toward the merchant's target FPR
 *     equilibrium.
 *
 * The adaptation is asymmetric by design: the fraud-miss step is
 * `step × missCostRatio` (default 4×) the false-alarm step — in fraud,
 * missed fraud is worse than a false alarm at almost every margin, so
 * the controller approaches the optimum from the "safe" side.
 *
 * Per-merchant observed fraud rate is tracked by EWMA so the thresholds
 * react to attack campaigns (rate spike → tighten) rather than only
 * to individual outcomes.
 *
 * Complexity: O(1) per decision/outcome; O(merchants) memory.
 *
 * @module FraudDetectionLayer/Engine
 */

import {
  AdaptiveThresholdOptions,
  MerchantRiskProfile,
  ThresholdDecision,
  ThresholdOutcome,
} from './types';

interface MerchantState {
  flagT: number;
  blockT: number;
  /** EWMA of confirmed-fraud rate on *decided* transactions */
  fraudRate: number;
  /** EWMA of false-alarm rate on flagged/declined transactions */
  fpRate: number;
  decisions: number;
}

export class AdaptiveThresholds {
  private readonly _targetFpr: number;
  private readonly _lr: number;
  private readonly _min: number;
  private readonly _max: number;
  private readonly _step: number;
  private readonly _merchants = new Map<string, MerchantState>();
  /** defaults: flag at 40, block at 70 of the score range */
  private readonly _defaultFlag: number;
  private readonly _defaultBlock: number;

  constructor(options: AdaptiveThresholdOptions = {}) {
    this._targetFpr = options.targetFalsePositiveRate ?? 0.02;
    this._lr = options.learningRate ?? 0.05;
    this._min = options.scoreMin ?? 0;
    this._max = options.scoreMax ?? 100;
    this._step = options.step ?? 0.01;
    const span = this._max - this._min;
    this._defaultFlag = this._min + 0.4 * span;
    this._defaultBlock = this._min + 0.7 * span;
  }

  /* ---------------------------------------------------------------- */
  /* Scoring                                                           */
  /* ---------------------------------------------------------------- */

  /** Apply the merchant's current thresholds to a score. */
  decide(merchantId: string, score: number): ThresholdDecision {
    const m = this._merchant(merchantId);
    const decision =
      score >= m.blockT ? 'decline' : score >= m.flagT ? 'review' : 'approve';
    return {
      merchantId,
      score,
      decision,
      flagThreshold: m.flagT,
      blockThreshold: m.blockT,
      fpPressure: clamp01(m.fpRate / Math.max(1e-6, this._targetFpr * 3)),
    };
  }

  /* ---------------------------------------------------------------- */
  /* Feedback                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * Fold an investigation outcome into the merchant profile.
   * `score` = the score the transaction received when decided —
   * threshold movement uses it to aim the correction near where the
   * miss/alarm actually happened, not blind ±steps.
   */
  feedback(merchantId: string, score: number, outcome: ThresholdOutcome): void {
    const m = this._merchant(merchantId);
    m.decisions++;
    const span = this._max - this._min;
    const step = this._step * span;

    if (outcome === 'fraud-confirmed') {
      // miss: tighten both thresholds toward the missed score
      m.fraudRate = ewma(m.fraudRate, 1, this._lr);
      const tighten = step * 4; // asymmetric: misses cost more
      m.flagT = clamp(m.flagT - tighten, this._min, m.blockT - 1);
      m.blockT = clamp(m.blockT - tighten * 0.5, m.flagT + 1, this._max);
    } else if (outcome === 'false-alarm') {
      // crying wolf: loosen toward the alarmed score
      m.fpRate = ewma(m.fpRate, 1, this._lr);
      m.fraudRate = ewma(m.fraudRate, 0, this._lr);
      m.blockT = clamp(m.blockT + step, m.flagT + 1, this._max);
      m.flagT = clamp(m.flagT + step * 0.5, this._min, m.blockT - 1);
    } else {
      // clean: EWMA decay + gentle pull toward the FPR equilibrium —
      // if fpRate is above target, keep loosening slightly; else hold.
      m.fpRate = ewma(m.fpRate, 0, this._lr);
      m.fraudRate = ewma(m.fraudRate, 0, this._lr);
      if (m.fpRate > this._targetFpr * 2) {
        m.flagT = clamp(m.flagT + step * 0.25, this._min, m.blockT - 1);
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* Queries                                                           */
  /* ---------------------------------------------------------------- */

  profile(merchantId: string): MerchantRiskProfile {
    const m = this._merchant(merchantId);
    return {
      merchantId,
      flagThreshold: m.flagT,
      blockThreshold: m.blockT,
      observedFraudRate: m.fraudRate,
      decisions: m.decisions,
    };
  }

  /** Reset one merchant to defaults (new fraud model deployment). */
  reset(merchantId: string): void {
    this._merchants.delete(merchantId);
  }

  get merchantCount(): number {
    return this._merchants.size;
  }

  /* ---------------------------------------------------------------- */

  private _merchant(id: string): MerchantState {
    let m = this._merchants.get(id);
    if (m === undefined) {
      m = {
        flagT: this._defaultFlag,
        blockT: this._defaultBlock,
        fraudRate: 0,
        fpRate: 0,
        decisions: 0,
      };
      this._merchants.set(id, m);
    }
    return m;
  }
}

function ewma(prev: number, x: number, lr: number): number {
  return prev + lr * (x - prev);
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

function clamp01(x: number): number {
  return clamp(x, 0, 1);
}
