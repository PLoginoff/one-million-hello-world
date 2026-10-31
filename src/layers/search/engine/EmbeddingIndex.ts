/**
 * EmbeddingIndex — dense vector index, exact + ANN.
 *
 * `implementations/structures/VectorIndex` already provides map-based
 * storage with random-projection LSH bucketing. This engine module is
 * the higher-performance sibling aimed at production retrieval:
 *
 * Storage — Structure-of-Arrays: every vector lives in one contiguous
 * `Float64Array` slab (`n × dims`), addressed by integer slot. SoA
 * keeps the inner distance loop over sequential memory — the access
 * pattern SIMD/auto-vectorization (and JS JITs) optimize well, unlike
 * pointer-chasing a `Map<id, Float64Array>`.
 *
 * Exact search — O(n·d) brute force with a bounded max-heap of size k,
 * so memory stays O(k) and results arrive sorted.
 *
 * Approximate search — an HNSW-*style* navigable small-world graph.
 * Real HNSW builds a hierarchical skip-list of proximity graphs; this
 * implementation keeps the essential mechanics:
 *
 *   - each node draws a level ℓ ~ Geometric(1/ln M): exponentially
 *     fewer nodes at higher levels → logarithmic zoom-out,
 *   - insert greedily descends from the top level to the node's level,
 *     then links each level to its `maxNeighbors` nearest neighbors,
 *   - query descends to level 0, then runs beam search (width efSearch)
 *     over the base layer.
 *
 * Honest simplifications vs. the Malkov–Yashunin paper: no neighbor-
 * selection heuristic (we take the ef-closest instead of the diversity-
 * aware pruning), deletes are soft (tombstoned slots, graph edges may
 * dangle until `compact()`). Recall on clustered data is still strong;
 * `efSearch` trades latency for it.
 *
 * Complexity: insert O(efConstruction · M · d); query ≈ O(ef·M·d)
 * graph / O(n·d) exact; memory O(n·d + n·M·levels).
 *
 * @module SearchLayer/Engine
 */

import {
  EmbeddingHit,
  EmbeddingIndexOptions,
  EmbeddingIndexStats,
  EmbeddingMetric,
  EmbeddingSearchResult,
} from './types';

/** mulberry32 — deterministic seeded PRNG (level draws, tie-breaks). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Neighbor list at one level: parallel arrays keep iteration tight. */
interface LevelEdges {
  /** neighbor slot ids, packed per node, fixed stride = maxNeighbors */
  readonly nbr: Int32Array;
  /** active neighbor count per node */
  readonly cnt: Uint8Array;
}

export class EmbeddingIndex {
  private readonly _dims: number;
  private readonly _metric: EmbeddingMetric;
  private readonly _M: number;
  private readonly _efS: number;
  private readonly _efC: number;
  private readonly _rng: () => number;

  /** slot → external doc id */
  private readonly _ids: string[] = [];
  /** external doc id → slot */
  private readonly _slotOf = new Map<string, number>();
  /** contiguous vector slab: slot*dims + component */
  private _vecs = new Float64Array(0);
  /** slab capacity in vectors */
  private _cap = 0;
  /** tombstoned slots available for reuse */
  private readonly _free: number[] = [];
  /** slot → assigned level (0 = base layer only) */
  private readonly _level: number[] = [];
  /** level → edge table */
  private _levels: LevelEdges[] = [];
  /** entry point slot for graph descent; -1 when empty */
  private _entry = -1;

  private _exactQueries = 0;
  private _graphQueries = 0;

  constructor(options: EmbeddingIndexOptions) {
    if (options.dims <= 0) throw new Error('dims must be positive');
    this._dims = options.dims;
    this._metric = options.metric ?? 'cosine';
    this._M = Math.max(2, options.maxNeighbors ?? 16);
    this._efS = Math.max(1, options.efSearch ?? 32);
    this._efC = Math.max(this._efS, options.efConstruction ?? 64);
    this._rng = mulberry32(options.seed ?? 42);
    this._levels = [this._newLevel(16)];
  }

  get size(): number {
    return this._ids.length - this._free.length;
  }

  /* ---------------------------------------------------------------- */
  /* Mutation                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * Insert (or replace) a vector. Replacement reuses the slot when the
   * id already exists — the vector is rewritten in place and the node
   * keeps its graph edges (stale-by-one-edition edges are harmless for
   * recall, and a full re-link is rarely worth it).
   */
  add(id: string, vector: ArrayLike<number>): void {
    if (vector.length !== this._dims) {
      throw new Error(`vector dim ${vector.length} != index dim ${this._dims}`);
    }
    const existing = this._slotOf.get(id);
    if (existing !== undefined) {
      this._vecs.set(vector as ArrayLike<number> as number[], existing * this._dims);
      return;
    }

    const slot = this._alloc(id, vector);
    if (this._M > 0) this._linkGraph(slot);
  }

  /** Soft-delete: removes the mapping; graph edges dangle until compact(). */
  remove(id: string): boolean {
    const slot = this._slotOf.get(id);
    if (slot === undefined) return false;
    this._slotOf.delete(id);
    this._free.push(slot);
    if (this._entry === slot) this._entry = this._pickEntry();
    return true;
  }

  /** Vector back out — copy, so callers can't mutate the slab. */
  get(id: string): Float64Array | undefined {
    const slot = this._slotOf.get(id);
    if (slot === undefined) return undefined;
    return this._vecs.slice(slot * this._dims, slot * this._dims + this._dims);
  }

  /* ---------------------------------------------------------------- */
  /* Search                                                            */
  /* ---------------------------------------------------------------- */

  /**
   * k-NN. `mode: 'exact'` always scans; `'auto'` uses the graph when it
   * exists and falls back to exact for small indexes (graph overhead
   * doesn't pay off below ~200 nodes) or when the graph is empty.
   */
  search(
    query: ArrayLike<number>,
    k = 10,
    mode: 'exact' | 'graph' | 'auto' = 'auto'
  ): EmbeddingSearchResult {
    if (query.length !== this._dims) {
      throw new Error(`query dim ${query.length} != index dim ${this._dims}`);
    }
    if (this.size === 0) return { hits: [], path: 'empty', scored: 0 };
    const useGraph =
      mode === 'graph' ||
      (mode === 'auto' && this._M > 0 && this.size >= 200 && this._entry >= 0);
    if (useGraph && this._entry >= 0) {
      return this._graphSearch(query, Math.max(k, this._efS));
    }
    return this._exactSearch(query, k);
  }

  /** Convenience: just the hits. */
  knn(query: ArrayLike<number>, k = 10): EmbeddingHit[] {
    return [...this.search(query, k).hits];
  }

  /* ---------------------------------------------------------------- */
  /* Diagnostics                                                       */
  /* ---------------------------------------------------------------- */

  stats(): EmbeddingIndexStats {
    const levelCounts: number[] = [];
    let edgeCount = 0;
    for (let l = 0; l < this._levels.length; l++) {
      let nodes = 0;
      for (let s = 0; s < this._ids.length; s++) {
        if (this._isLive(s) && this._level[s] >= l) nodes++;
      }
      levelCounts.push(nodes);
      const tbl = this._levels[l];
      for (let s = 0; s < this._ids.length; s++) edgeCount += tbl.cnt[s];
    }
    return {
      size: this.size,
      dims: this._dims,
      metric: this._metric,
      levelCounts,
      edgeCount,
      exactQueries: this._exactQueries,
      graphQueries: this._graphQueries,
    };
  }

  /**
   * Reclaim tombstoned slots and rebuild the graph from live vectors.
   * O(n·insertCost) — run during maintenance windows, not inline.
   */
  compact(): void {
    const live: Array<{ id: string; vec: Float64Array }> = [];
    for (const [id, slot] of this._slotOf) {
      live.push({
        id,
        vec: this._vecs.slice(slot * this._dims, slot * this._dims + this._dims),
      });
    }
    this._slotOf.clear();
    this._ids.length = 0;
    this._free.length = 0;
    this._level.length = 0;
    this._levels = [this._newLevel(Math.max(16, live.length))];
    this._entry = -1;
    this._cap = 0;
    this._vecs = new Float64Array(0);
    for (const { id, vec } of live) this.add(id, vec);
  }

  /* ---------------------------------------------------------------- */
  /* Internals — storage                                               */
  /* ---------------------------------------------------------------- */

  private _newLevel(nSlots: number): LevelEdges {
    return {
      nbr: new Int32Array(nSlots * Math.max(1, this._M)).fill(-1),
      cnt: new Uint8Array(nSlots),
    };
  }

  private _growLevel(l: LevelEdges, needSlots: number): LevelEdges {
    const cur = l.cnt.length;
    if (needSlots <= cur) return l;
    let cap = cur;
    while (cap < needSlots) cap *= 2;
    const nbr = new Int32Array(cap * this._M).fill(-1);
    const cnt = new Uint8Array(cap);
    nbr.set(l.nbr.subarray(0, cur * this._M));
    cnt.set(l.cnt);
    return { nbr, cnt };
  }

  private _alloc(id: string, vector: ArrayLike<number>): number {
    let slot: number;
    if (this._free.length > 0) {
      slot = this._free.pop()!;
      this._ids[slot] = id;
    } else {
      slot = this._ids.length;
      this._ids.push(id);
      if (slot >= this._cap) {
        const newCap = Math.max(16, this._cap * 2 || 16);
        const grown = new Float64Array(newCap * this._dims);
        grown.set(this._vecs);
        this._vecs = grown;
        this._cap = newCap;
      }
    }
    this._vecs.set(vector as ArrayLike<number> as number[], slot * this._dims);
    this._slotOf.set(id, slot);
    // ensure level + base-layer edge arrays cover this slot
    while (this._level.length <= slot) this._level.push(0);
    for (let l = 0; l < this._levels.length; l++) {
      this._levels[l] = this._growLevel(this._levels[l], slot + 1);
      this._levels[l].cnt[slot] = 0;
      const base = slot * this._M;
      for (let i = 0; i < this._M; i++) this._levels[l].nbr[base + i] = -1;
    }
    return slot;
  }

  private _isLive(slot: number): boolean {
    const id = this._ids[slot];
    return id !== undefined && this._slotOf.get(id) === slot;
  }

  private _drawLevel(): number {
    // P(ℓ) ∝ e^{-ℓ/ln M} — same distribution as HNSW.
    const ml = 1 / Math.log(this._M);
    return Math.floor(-Math.log(Math.max(this._rng(), 1e-12)) * ml);
  }

  private _pickEntry(): number {
    // re-scan for the highest-level live node (rare path: only on
    // entry-point removal — O(n) is fine).
    let best = -1;
    let bestLvl = -1;
    for (let s = 0; s < this._ids.length; s++) {
      if (this._isLive(s) && this._level[s] > bestLvl) {
        bestLvl = this._level[s];
        best = s;
      }
    }
    return best;
  }

  /* ---------------------------------------------------------------- */
  /* Internals — distances (higher score = better)                     */
  /* ---------------------------------------------------------------- */

  /** similarity between a raw query vector and stored slot. */
  private _sim(query: ArrayLike<number>, slot: number): number {
    const off = slot * this._dims;
    const v = this._vecs;
    switch (this._metric) {
      case 'cosine': {
        let dot = 0;
        let na = 0;
        let nb = 0;
        for (let i = 0; i < this._dims; i++) {
          const q = query[i];
          const x = v[off + i];
          dot += q * x;
          na += q * q;
          nb += x * x;
        }
        return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
      }
      case 'dot': {
        let s = 0;
        for (let i = 0; i < this._dims; i++) s += query[i] * v[off + i];
        return s;
      }
      case 'l2': {
        // negated squared distance — higher = closer, monotone in L2.
        let s = 0;
        for (let i = 0; i < this._dims; i++) {
          const d = query[i] - v[off + i];
          s += d * d;
        }
        return -s;
      }
    }
  }

  private _simSlots(a: number, b: number): number {
    const off = a * this._dims;
    const v = this._vecs;
    // slot-vs-slot via a lightweight view — same code path as query sim.
    return this._sim(v.subarray(off, off + this._dims), b);
  }

  /* ---------------------------------------------------------------- */
  /* Internals — exact search                                          */
  /* ---------------------------------------------------------------- */

  /**
   * Bounded max-heap of size k over the full scan. Using a heap (not a
   * sorted array) keeps the scan O(n·d + n·log k) — the sort only ever
   * touches k elements at the end.
   */
  private _exactSearch(query: ArrayLike<number>, k: number): EmbeddingSearchResult {
    this._exactQueries++;
    const heap = new SlotHeap(k);
    let scored = 0;
    for (let slot = 0; slot < this._ids.length; slot++) {
      if (!this._isLive(slot)) continue;
      heap.push(slot, this._sim(query, slot));
      scored++;
    }
    const hits = heap.drain().map(({ slot, score }) => ({
      id: this._ids[slot],
      score,
    }));
    return { hits, path: 'exact', scored };
  }

  /* ---------------------------------------------------------------- */
  /* Internals — graph                                                 */
  /* ---------------------------------------------------------------- */

  private _linkGraph(slot: number): void {
    const lvl = this._drawLevel();
    this._level[slot] = lvl;
    // grow level tables
    while (this._levels.length <= lvl) {
      this._levels.push(this._newLevel(this._ids.length));
    }
    for (let l = 0; l < this._levels.length; l++) {
      this._levels[l] = this._growLevel(this._levels[l], this._ids.length);
    }

    if (this._entry < 0) {
      this._entry = slot;
      return;
    }

    // Phase 1: greedy descent from entry through levels above our own —
    // single-element beam, closest-so-far zooms toward the insert point.
    let ep = this._entry;
    const entryLvl = this._level[ep];
    for (let l = Math.min(entryLvl, this._levels.length - 1); l > lvl; l--) {
      ep = this._greedyHop(slot, ep, l);
    }

    // Phase 2: per level ≤ lvl, beam-search the ef closest candidates
    // then link the M nearest both ways.
    for (let l = Math.min(lvl, entryLvl); l >= 0; l--) {
      const cands = this._beamSearch(slot, [ep], this._efC, l);
      this._link(slot, cands, l);
      if (cands.length > 0) ep = cands[0].slot;
    }

    if (lvl > this._level[this._entry]) this._entry = slot;
  }

  /** One greedy step at level l: hop to any neighbor closer to target. */
  private _greedyHop(target: number, start: number, l: number): number {
    let cur = start;
    let curSim = this._simSlots(target, cur);
    const tbl = this._levels[l];
    for (;;) {
      let best = cur;
      let bestSim = curSim;
      const base = cur * this._M;
      const n = tbl.cnt[cur];
      for (let i = 0; i < n; i++) {
        const nb = tbl.nbr[base + i];
        if (nb < 0 || !this._isLive(nb)) continue;
        const s = this._simSlots(target, nb);
        if (s > bestSim) {
          bestSim = s;
          best = nb;
        }
      }
      if (best === cur) return cur;
      cur = best;
      curSim = bestSim;
    }
  }

  /**
   * Beam search at level l from seed(s), returning the ef closest live
   * slots to `target`. Standard HNSW searchLayer: a candidate min-queue
   * paired with a worst-result max-queue.
   */
  private _beamSearch(
    target: number,
    seeds: readonly number[],
    ef: number,
    l: number
  ): Array<{ slot: number; score: number }> {
    const tbl = this._levels[l];
    const seen = new Set<number>();
    const cand = new SlotHeap(ef * 4); // min-popped via drain trick: keep simple sorted pool
    const results: Array<{ slot: number; score: number }> = [];

    for (const s of seeds) {
      if (s < 0 || !this._isLive(s)) continue;
      if (seen.has(s)) continue;
      seen.add(s);
      results.push({ slot: s, score: this._simSlots(target, s) });
    }
    // priority walk: repeatedly expand the best unexplored candidate
    const queue = results.slice();
    let worst = () => (results.length >= ef ? results[results.length - 1].score : -Infinity);
    while (queue.length > 0) {
      // pop best-scored candidate (small ef → linear pop is fine)
      let bi = 0;
      for (let i = 1; i < queue.length; i++) {
        if (queue[i].score > queue[bi].score) bi = i;
      }
      const c = queue.splice(bi, 1)[0];
      if (c.score < worst()) break; // can't beat the worst kept result
      const base = c.slot * this._M;
      const n = tbl.cnt[c.slot];
      for (let i = 0; i < n; i++) {
        const nb = tbl.nbr[base + i];
        if (nb < 0 || seen.has(nb) || !this._isLive(nb)) continue;
        seen.add(nb);
        const s = this._simSlots(target, nb);
        if (s > worst() || results.length < ef) {
          results.push({ slot: nb, score: s });
          queue.push({ slot: nb, score: s });
          if (results.length > ef) {
            results.sort((a, b) => b.score - a.score);
            results.length = ef;
          }
        }
      }
    }
    results.sort((a, b) => b.score - a.score);
    cand.clear();
    return results.slice(0, ef);
  }

  /** Bidirectionally link `slot` to its M nearest candidates at level l. */
  private _link(
    slot: number,
    cands: readonly { slot: number; score: number }[],
    l: number
  ): void {
    const tbl = this._levels[l];
    const take = Math.min(this._M, cands.length);
    const base = slot * this._M;
    let cnt = 0;
    for (let i = 0; i < take; i++) {
      tbl.nbr[base + i] = cands[i].slot;
      cnt++;
      this._backlink(cands[i].slot, slot, l, cands[i].score);
    }
    tbl.cnt[slot] = cnt;
  }

  /**
   * Add `slot` to `other`'s neighbor list, evicting the farthest
   * neighbor when the list is full (keeps degree bounded by M).
   */
  private _backlink(other: number, slot: number, l: number, sim: number): void {
    const tbl = this._levels[l];
    const base = other * this._M;
    const n = tbl.cnt[other];
    if (n < this._M) {
      tbl.nbr[base + n] = slot;
      tbl.cnt[other] = n + 1;
      return;
    }
    // find the weakest existing edge and replace it if we're closer
    let worstI = -1;
    let worstS = Infinity;
    for (let i = 0; i < n; i++) {
      const nb = tbl.nbr[base + i];
      if (nb < 0) {
        tbl.nbr[base + i] = slot;
        return;
      }
      const s = this._simSlots(other, nb);
      if (s < worstS) {
        worstS = s;
        worstI = i;
      }
    }
    if (worstI >= 0 && sim > worstS) tbl.nbr[base + worstI] = slot;
  }

  /* ---------------------------------------------------------------- */
  /* Internals — query path                                            */
  /* ---------------------------------------------------------------- */

  private _graphSearch(
    query: ArrayLike<number>,
    ef: number
  ): EmbeddingSearchResult {
    this._graphQueries++;
    let scored = 0;

    // descent: greedy hops from entry down to level 1
    let ep = this._entry;
    for (let l = Math.min(this._level[ep], this._levels.length - 1); l > 0; l--) {
      const tbl = this._levels[l];
      let cur = ep;
      let curSim = this._sim(query, cur);
      scored++;
      for (;;) {
        let best = cur;
        let bestSim = curSim;
        const base = cur * this._M;
        const n = tbl.cnt[cur];
        for (let i = 0; i < n; i++) {
          const nb = tbl.nbr[base + i];
          if (nb < 0 || !this._isLive(nb)) continue;
          const s = this._sim(query, nb);
          scored++;
          if (s > bestSim) {
            bestSim = s;
            best = nb;
          }
        }
        if (best === cur) break;
        cur = best;
        curSim = bestSim;
      }
      ep = cur;
    }

    // level 0: beam search over the base layer
    const tbl = this._levels[0];
    const seen = new Set<number>([ep]);
    const results: Array<{ slot: number; score: number }> = [
      { slot: ep, score: this._sim(query, ep) },
    ];
    scored++;
    const queue = results.slice();
    const worst = () =>
      results.length >= ef ? results[results.length - 1].score : -Infinity;

    while (queue.length > 0) {
      let bi = 0;
      for (let i = 1; i < queue.length; i++) {
        if (queue[i].score > queue[bi].score) bi = i;
      }
      const c = queue.splice(bi, 1)[0];
      if (c.score < worst()) break;
      const base = c.slot * this._M;
      const n = tbl.cnt[c.slot];
      for (let i = 0; i < n; i++) {
        const nb = tbl.nbr[base + i];
        if (nb < 0 || seen.has(nb) || !this._isLive(nb)) continue;
        seen.add(nb);
        const s = this._sim(query, nb);
        scored++;
        if (s > worst() || results.length < ef) {
          results.push({ slot: nb, score: s });
          queue.push({ slot: nb, score: s });
          if (results.length > ef) {
            results.sort((a, b) => b.score - a.score);
            results.length = ef;
          }
        }
      }
    }

    results.sort((a, b) => b.score - a.score);
    const hits = results
      .filter((r) => this._isLive(r.slot))
      .map(({ slot, score }) => ({ id: this._ids[slot], score }));
    return { hits, path: 'graph', scored };
  }
}

/**
 * Bounded max-heap keyed by score. push() keeps only the k best —
 * the workhorse of exact k-NN and graph candidate collection.
 */
class SlotHeap {
  private readonly _slots: number[] = [];
  private readonly _scores: number[] = [];

  constructor(private readonly _k: number) {}

  clear(): void {
    this._slots.length = 0;
    this._scores.length = 0;
  }

  /** offer a (slot, score); drop when outside the running top-k. */
  push(slot: number, score: number): void {
    const n = this._slots.length;
    if (n >= this._k && score <= this._scores[0]) return; // heap top = worst kept
    this._slots.push(slot);
    this._scores.push(score);
    this._siftUp(n);
    if (this._slots.length > this._k) this._popMin();
  }

  /** drain to a score-sorted (desc) array. */
  drain(): Array<{ slot: number; score: number }> {
    const out = this._slots.map((slot, i) => ({ slot, score: this._scores[i] }));
    out.sort((a, b) => b.score - a.score || a.slot - b.slot);
    return out;
  }

  private _siftUp(i: number): void {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this._scores[p] <= this._scores[i]) break;
      this._swap(p, i);
      i = p;
    }
  }

  private _popMin(): void {
    const last = this._slots.length - 1;
    this._swap(0, last);
    this._slots.pop();
    this._scores.pop();
    let i = 0;
    const n = this._slots.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < n && this._scores[l] < this._scores[m]) m = l;
      if (r < n && this._scores[r] < this._scores[m]) m = r;
      if (m === i) break;
      this._swap(m, i);
      i = m;
    }
  }

  private _swap(a: number, b: number): void {
    const ts = this._slots[a];
    this._slots[a] = this._slots[b];
    this._slots[b] = ts;
    const tc = this._scores[a];
    this._scores[a] = this._scores[b];
    this._scores[b] = tc;
  }
}
