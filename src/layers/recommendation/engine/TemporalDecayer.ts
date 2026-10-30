/**
 * TemporalDecayer — exponential decay of interaction weight by age.
 *
 * The layer's rating matrix stores raw values; for real feeds, a
 * click from 6 months ago shouldn't weigh the same as yesterday's —
 * taste drifts. The standard treatment is exponential decay:
 *
 *   w(t) = 0.5^(age / halfLife)
 *
 * applied per interaction *at training/scoring time*, producing an
 * `effectiveValue` downstream models consume.
 *
 * Two uses:
 *  - `decayRating(r, at)`   → one interaction's weighted value.
 *  - `decayedMatrix(ratings)` → re-scale a whole interaction log.
 *
 * `maxAgeMs` is the cutoff: interactions beyond it are dropped
 * (weight → 0) — bounds both storage and stale-profile pull.
 *
 * @module RecommendationLayer/Engine
 */

import { Rating } from '../implementations/recommend/Types';
import {
  DecayedRating,
  DecayOptions,
  RecClock,
  SystemRecClock,
} from './types';

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

export class TemporalDecayer {
  private readonly _halfLifeMs: number;
  private readonly _maxAgeMs: number;
  private readonly _clock: RecClock;

  constructor(options: DecayOptions = {}, clock?: RecClock) {
    this._halfLifeMs = options.halfLifeMs ?? THIRTY_DAYS;
    if (this._halfLifeMs <= 0) throw new RangeError('halfLifeMs must be > 0');
    this._maxAgeMs = options.maxAgeMs ?? 0;
    this._clock = clock ?? new SystemRecClock();
  }

  /** Decay weight ∈ (0,1] for a given age. */
  weight(ageMs: number): number {
    if (ageMs < 0) return 1; // future timestamps: full weight
    if (this._maxAgeMs > 0 && ageMs > this._maxAgeMs) return 0;
    return Math.pow(0.5, ageMs / this._halfLifeMs);
  }

  /** Weight for an interaction at `t`, against the clock's now. */
  weightAt(t: number): number {
    return this.weight(this._clock.now() - t);
  }

  /**
   * One decayed interaction. `effectiveValue` = value × weight —
   * implicit-feedback convention: lowering weight lowers the
   * *confidence* in the preference, not the preference itself.
   */
  decayRating(r: Rating, now?: number): DecayedRating {
    const at = r.timestamp ?? 0;
    const age = Math.max(0, (now ?? this._clock.now()) - at);
    const w = this.weight(age);
    return {
      userId: r.userId,
      itemId: r.itemId,
      value: r.value,
      effectiveValue: r.value * w,
      ageMs: age,
      weight: w,
    };
  }

  /**
   * All ratings with decay applied, dropping max-age-expired entries.
   * Feeds batch trainers a recency-weighted view.
   */
  decayedMatrix(ratings: readonly Rating[], now?: number): DecayedRating[] {
    const at = now ?? this._clock.now();
    const out: DecayedRating[] = [];
    for (const r of ratings) {
      const d = this.decayRating(r, at);
      if (d.weight > 0) out.push(d);
    }
    return out;
  }

  /**
   * Recency-weighted user profile: itemId → Σ(value·weight) /
   * Σ(weights). Dividing by total weight keeps the scale comparable
   * across users with different activity ages.
   */
  weightedProfile(
    ratings: readonly Rating[],
    userId: string,
    now?: number
  ): Map<string, number> {
    const at = now ?? this._clock.now();
    const num = new Map<string, number>();
    const den = new Map<string, number>();
    for (const r of ratings) {
      if (r.userId !== userId) continue;
      const d = this.decayRating(r, at);
      if (d.weight === 0) continue;
      num.set(r.itemId, (num.get(r.itemId) ?? 0) + d.effectiveValue);
      den.set(r.itemId, (den.get(r.itemId) ?? 0) + d.weight);
    }
    const out = new Map<string, number>();
    for (const [itemId, n] of num) {
      out.set(itemId, n / (den.get(itemId) ?? 1));
    }
    return out;
  }
}
