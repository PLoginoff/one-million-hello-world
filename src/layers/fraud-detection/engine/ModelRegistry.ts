/**
 * ModelRegistry — A/B model versioning with shadow scoring.
 *
 * Fraud models can't be swapped blind: a regression that starts
 * declining legitimate cards costs real money. The registry runs a
 * `primary` (production decisions) plus an optional `shadow` (same
 * transactions scored in parallel, results compared but NOT used).
 *
 * Every scored transaction records a `ShadowComparison`:
 *   divergence = |primary − shadow|
 *   disagree   = flag decisions differ at the threshold
 *
 * `stats()` summarizes shadow fidelity: disagreement rate and mean
 * divergence — the promotion criteria. Typical gate: shadow must
 * disagree on <2% of traffic before being promoted to primary.
 *
 * Deterministic score-threshold decisions keep the comparison
 * apples-to-apples even when models calibrate differently.
 *
 * @module FraudDetectionLayer/Engine
 */

import { Transaction } from '../implementations/fraud/Types';
import {
  ScoringModel,
  ShadowComparison,
  ShadowStats,
} from './types';

export interface ModelRegistryOptions {
  /** score ≥ threshold → 'flag'. Default 50. */
  readonly flagThreshold?: number;
}

export class ModelRegistry {
  private _primary: ScoringModel;
  private _shadow: ScoringModel | null;
  private readonly _threshold: number;
  private readonly _comparisons: ShadowComparison[];

  constructor(primary: ScoringModel, options: ModelRegistryOptions = {}) {
    this._primary = primary;
    this._shadow = null;
    this._threshold = options.flagThreshold ?? 50;
    this._comparisons = [];
  }

  get primary(): ScoringModel {
    return this._primary;
  }

  get shadow(): ScoringModel | null {
    return this._shadow;
  }

  /** Attach/detach a shadow model. */
  setShadow(model: ScoringModel | null): void {
    this._shadow = model;
  }

  /**
   * Score with the primary; if a shadow is attached, score that too
   * and record the comparison. Returns the PRIMARY score — shadow
   * never affects production decisions.
   */
  score(tx: Transaction): number {
    const primaryScore = this._primary.score(tx);
    if (this._shadow !== null) {
      const shadowScore = this._shadow.score(tx);
      const primaryDecision = primaryScore >= this._threshold ? 'flag' : 'pass';
      const shadowDecision = shadowScore >= this._threshold ? 'flag' : 'pass';
      this._comparisons.push({
        transactionId: tx.id,
        primaryScore,
        shadowScore,
        divergence: Math.abs(primaryScore - shadowScore),
        primaryDecision,
        shadowDecision,
        disagree: primaryDecision !== shadowDecision,
      });
    }
    return primaryScore;
  }

  /** Promote the shadow to primary (swapping roles), clearing stats. */
  promote(): void {
    if (this._shadow === null) throw new Error('no shadow to promote');
    this._primary = this._shadow;
    this._shadow = null;
    this._comparisons.length = 0;
  }

  /** Recorded comparisons (most recent last). */
  get comparisons(): readonly ShadowComparison[] {
    return this._comparisons;
  }

  /** Aggregate shadow fidelity stats. */
  stats(): ShadowStats {
    const n = this._comparisons.length;
    if (n === 0) {
      return {
        comparisons: 0,
        disagreements: 0,
        disagreementRate: 0,
        meanDivergence: 0,
      };
    }
    let disagreements = 0;
    let divergenceSum = 0;
    for (const c of this._comparisons) {
      if (c.disagree) disagreements++;
      divergenceSum += c.divergence;
    }
    return {
      comparisons: n,
      disagreements,
      disagreementRate: disagreements / n,
      meanDivergence: divergenceSum / n,
    };
  }
}
