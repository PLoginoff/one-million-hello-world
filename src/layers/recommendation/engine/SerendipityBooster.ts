/**
 * SerendipityBooster — "unexpected but good" promotion.
 *
 * Collaborative filtering has a well-known failure: it keeps
 * recommending inside the user's established bubble. Serendipity
 * boosting reserves a slice of the final list for items the model
 * still scores confidently but which sit *outside* the user's
 * usual categories.
 *
 * Surprise is measured as 1 − category-affinity: how often the
 * candidate's category appears in the user's history, normalized.
 * An item in a never-seen category scores 1 (full surprise); an
 * item in the user's top category scores ~0.
 *
 * Eligibility is gated by `minScore` on the model's own confidence —
 * this is what distinguishes serendipity ("you'd never have found
 * this, but you'll like it") from noise ("here's random stuff").
 *
 * Greedy fill: the booster selects surprise-ranked eligible
 * candidates up to `slotRatio × topN`, the rest come from the raw
 * ranking (excluding selected ids).
 *
 * @module RecommendationLayer/Engine
 */

import {
  CategorizedItem,
  SerendipitousItem,
  SerendipityOptions,
} from './types';
import { ScoredItem } from '../implementations/recommend/Types';

export class SerendipityBooster {
  private readonly _slotRatio: number;
  private readonly _minScore: number;

  constructor(options: SerendipityOptions = {}) {
    this._slotRatio = options.slotRatio ?? 0.2;
    this._minScore = options.minScore ?? 0;
    if (this._slotRatio < 0 || this._slotRatio > 1) {
      throw new RangeError('slotRatio must be in [0,1]');
    }
  }

  /**
   * Re-rank `items` (scored + categorized candidates) for a user
   * whose `profile` maps category → interaction share (0..1, sums
   * to ~1 — `SerendipityBooster.profileFrom` builds it).
   */
  boost(
    items: readonly CategorizedItem[],
    profile: ReadonlyMap<string, number>,
    topN = 10
  ): SerendipitousItem[] {
    const slots = Math.max(1, Math.round(topN * this._slotRatio));

    // Candidates ranked by model score, tagged with surprise.
    const scored = items.map((item) => ({
      ...item,
      surprise: 1 - (profile.get(item.category) ?? 0),
    }));

    // Serendipity pool: confident but surprising, sorted by
    // surprise then score.
    const pool = scored
      .filter(
        (s) =>
          s.score >= this._minScore &&
          s.surprise > 0.5 // strictly outside dominant categories
      )
      .sort((a, b) => b.surprise - a.surprise || b.score - a.score);

    const chosen = new Map<string, SerendipitousItem>();
    for (const s of pool.slice(0, slots)) {
      chosen.set(s.itemId, { itemId: s.itemId, score: s.score, surprise: s.surprise });
    }

    // Fill remaining slots by raw relevance (excluding picks).
    const rest = scored
      .filter((s) => !chosen.has(s.itemId))
      .sort((a, b) => b.score - a.score);
    for (const s of rest) {
      if (chosen.size >= topN) break;
      chosen.set(s.itemId, { itemId: s.itemId, score: s.score, surprise: s.surprise });
    }

    // Final order: score desc, but serendipity picks carry their flag.
    const out = [...chosen.values()];
    out.sort((a, b) => b.score - a.score);
    return out;
  }

  /**
   * Build a category-share profile from a user's categorized
   * interaction history: category → share of that user's items.
   */
  static profileFrom(
    history: readonly CategorizedItem[]
  ): Map<string, number> {
    const counts = new Map<string, number>();
    for (const h of history) {
      counts.set(h.category, (counts.get(h.category) ?? 0) + 1);
    }
    const total = history.length || 1;
    const out = new Map<string, number>();
    for (const [c, n] of counts) out.set(c, n / total);
    return out;
  }
}
