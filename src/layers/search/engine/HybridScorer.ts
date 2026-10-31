/**
 * HybridScorer — fuse lexical + vector candidate lists.
 *
 * Modern search blends two retrievers with orthogonal failure modes:
 * BM25 nails rare-term precision but misses synonyms; dense embeddings
 * capture semantics but hallucinate on exact strings. Neither score
 * scale is comparable (BM25 is unbounded; cosine is [-1,1]), which is
 * exactly what reciprocal rank fusion solves:
 *
 *   RRF(d) = Σ_sources w_src / (k + rank_src(d))      rank is 1-based
 *
 * RRF needs no calibration — only *order* — and empirically beats
 * linear score fusion when scales differ (Cormack, Clarke, Büttcher
 * 2009). The alternative `minmax` mode normalizes each list to [0,1]
 * first and blends weighted scores; it preserves intra-list magnitude
 * gaps at the cost of sensitivity to outlier maxima.
 *
 * Every fused hit reports per-source contributions and the best rank
 * it achieved anywhere — enough for "why did this surface" debugging
 * without re-running the retrievers.
 *
 * Complexity: O(Σ|list|) per fusion; no dependence on corpus size.
 *
 * @module SearchLayer/Engine
 */

import {
  CandidateList,
  EmbeddingHit,
  FusedHit,
  FusionMethod,
  HybridScorerOptions,
} from './types';

export class HybridScorer {
  private readonly _method: FusionMethod;
  private readonly _rrfK: number;
  private readonly _weights: Readonly<Record<string, number>>;
  private readonly _topN: number;

  constructor(options: HybridScorerOptions = {}) {
    this._method = options.method ?? 'rrf';
    this._rrfK = options.rrfK ?? 60;
    this._weights = options.sourceWeights ?? {};
    this._topN = options.topN ?? 10;
  }

  /**
   * Fuse two or more candidate lists into one ranking. Duplicate ids
   * across lists accumulate — that accumulation is the point: an id
   * both retrievers liked outranks a single-source hit.
   */
  fuse(lists: readonly CandidateList[], topN = this._topN): FusedHit[] {
    const acc = new Map<
      string,
      { score: number; contrib: Record<string, number>; best: number; srcs: Set<string> }
    >();

    for (const list of lists) {
      const w = this._weights[list.source] ?? 1;
      if (w === 0) continue;
      const norm =
        this._method === 'minmax' ? minmaxRange(list.hits) : null;

      for (let i = 0; i < list.hits.length; i++) {
        const hit = list.hits[i];
        const rank = i + 1;
        const contrib =
          this._method === 'rrf'
            ? w / (this._rrfK + rank)
            : w * normalizeScore(hit.score, norm!);

        let e = acc.get(hit.id);
        if (e === undefined) {
          e = { score: 0, contrib: {}, best: rank, srcs: new Set() };
          acc.set(hit.id, e);
        }
        e.score += contrib;
        e.contrib[list.source] = (e.contrib[list.source] ?? 0) + contrib;
        if (rank < e.best) e.best = rank;
        e.srcs.add(list.source);
      }
    }

    const out: FusedHit[] = [...acc.entries()].map(([id, e]) => ({
      id,
      score: e.score,
      contributions: e.contrib,
      bestRank: e.best,
      sources: [...e.srcs].sort(),
    }));
    out.sort(
      (a, b) =>
        b.score - a.score || a.bestRank - b.bestRank || a.id.localeCompare(b.id)
    );
    return out.slice(0, topN);
  }

  /**
   * Two-list convenience for the canonical BM25+vector pair.
   * `bm25` and `vector` are just labeled hit arrays.
   */
  fusePair(
    bm25: readonly EmbeddingHit[],
    vector: readonly EmbeddingHit[],
    topN = this._topN
  ): FusedHit[] {
    return this.fuse(
      [
        { source: 'bm25', hits: bm25 },
        { source: 'vector', hits: vector },
      ],
      topN
    );
  }

  /**
   * Rank-aware merge diagnostics: overlap and rank correlation give a
   * quick read on whether the two retrievers agree (Kendall-tau-ish:
   * counting discordant common pairs, ties counted half).
   */
  agreement(a: readonly EmbeddingHit[], b: readonly EmbeddingHit[]): {
    overlap: number;
    rankCorrelation: number;
  } {
    const rankA = new Map<string, number>();
    a.forEach((h, i) => rankA.set(h.id, i));
    const common: Array<[number, number]> = [];
    b.forEach((h, i) => {
      const ra = rankA.get(h.id);
      if (ra !== undefined) common.push([ra, i]);
    });
    if (common.length < 2) {
      return { overlap: common.length, rankCorrelation: common.length === 1 ? 1 : 0 };
    }
    let concord = 0;
    let discord = 0;
    for (let i = 0; i < common.length; i++) {
      for (let j = i + 1; j < common.length; j++) {
        const d = common[i][0] - common[j][0];
        const e = common[i][1] - common[j][1];
        const prod = d * e;
        if (prod > 0) concord++;
        else if (prod < 0) discord++;
      }
    }
    const denom = (common.length * (common.length - 1)) / 2;
    return {
      overlap: common.length,
      rankCorrelation: (concord - discord) / denom,
    };
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function minmaxRange(hits: readonly EmbeddingHit[]): { min: number; range: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const h of hits) {
    if (h.score < min) min = h.score;
    if (h.score > max) max = h.score;
  }
  if (hits.length === 0) return { min: 0, range: 0 };
  return { min, range: max - min };
}

function normalizeScore(s: number, r: { min: number; range: number }): number {
  if (r.range <= 0) return 0;
  return (s - r.min) / r.range;
}
