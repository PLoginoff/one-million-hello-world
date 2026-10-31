/**
 * SemanticDedup — near-duplicate detection over embeddings.
 *
 * Exact dedup (content hash) misses paraphrases and re-encodings; pure
 * embedding k-NN dedup (`similarity ≥ τ → dup`) is right but costs a
 * full scan or ANN query per insert. This class layers three candidate
 * paths, cheapest first:
 *
 *   1. Signature pruning — a random-projection sketch per document
 *      (simhash-style: sign bits of `signatureSize` random hyperplanes).
 *      Hamming-similar sketches imply similar vectors with high
 *      probability; only pairs within `maxSignatureDistance` bits are
 *      verified. LSH banding over the signature narrows candidates to
 *      O(1) expected hits per bucket.
 *   2. ANN neighbors — k-NN against the backing `EmbeddingIndex`
 *      catches candidates the signature missed (low-but-positive
 *      collision probability at extreme τ).
 *   3. Exact verification — real cosine on the surviving candidate set
 *      decides membership.
 *
 * Clusters are union-find over doc ids: transitive near-duplication
 * (A≈B, B≈C) collapses to one cluster keyed by the first-seen member,
 * which is what canonicalization pipelines want.
 *
 * Complexity: signature O(dims·sig) per insert; candidate check
 * O(bandHits·dims + ann). Memory O(n·sig/8 + n·dims).
 *
 * @module SearchLayer/Engine
 */

import { EmbeddingIndex } from './EmbeddingIndex';
import {
  DedupCheck,
  DuplicateCluster,
  SemanticDedupOptions,
} from './types';

/** mulberry32 — deterministic hyperplane draws. */
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

const BANDS = 8; // signature bits per LSH band → sig/8 band hash keys

export class SemanticDedup {
  private readonly _index: EmbeddingIndex;
  private readonly _threshold: number;
  private readonly _sigSize: number;
  private readonly _maxSigDist: number;
  private readonly _candK: number;
  /** signatureSize random hyperplanes, dims each */
  private readonly _planes: Float64Array[] = [];
  /** bandIndex → bandHash → doc ids sharing that band */
  private readonly _bands: Map<number, Map<number, Set<string>>> = new Map();
  /** doc id → signature bits packed as Uint32Array */
  private readonly _sigs = new Map<string, Uint32Array>();
  /** union-find parent pointers */
  private readonly _parent = new Map<string, string>();
  /** canonical → member list (leaders only) */
  private readonly _members = new Map<string, string[]>();
  /** canonical → best pairwise similarity seen inside the cluster */
  private readonly _maxSim = new Map<string, number>();
  private readonly _dims: number;

  constructor(dims: number, options: SemanticDedupOptions = {}, index?: EmbeddingIndex) {
    if (dims <= 0) throw new Error('dims must be positive');
    this._dims = dims;
    this._threshold = options.threshold ?? 0.92;
    this._sigSize = options.signatureSize ?? 64;
    this._maxSigDist =
      options.maxSignatureDistance ?? Math.floor(this._sigSize / 4);
    this._candK = options.candidateK ?? 8;
    this._index =
      index ?? new EmbeddingIndex({ dims, metric: 'cosine', maxNeighbors: 16 });

    const rng = mulberry32(1337);
    for (let p = 0; p < this._sigSize; p++) {
      const v = new Float64Array(dims);
      for (let i = 0; i < dims; i++) v[i] = rng() * 2 - 1;
      this._planes.push(v);
    }
    for (let b = 0; b < Math.ceil(this._sigSize / BANDS); b++) {
      this._bands.set(b, new Map());
    }
  }

  get size(): number {
    return this._sigs.size;
  }

  /* ---------------------------------------------------------------- */
  /* Ingest                                                            */
  /* ---------------------------------------------------------------- */

  /**
   * Check-and-index: reports whether `vec` near-duplicates an existing
   * doc, and (when `add` is true) inserts it regardless — unique docs
   * start their own clusters; duplicates join the matched one.
   */
  check(id: string, vec: ArrayLike<number>, add = true): DedupCheck {
    if (this._sigs.has(id)) {
      return { duplicate: true, match: id, similarity: 1, cluster: this._find(id), path: 'exact' };
    }
    const sig = this._signature(vec);
    const candidates = new Set<string>();
    let path: DedupCheck['path'] = 'none';

    // Path 1 — signature band lookups
    for (const c of this._bandCandidates(sig)) {
      if (c === id) continue;
      const other = this._sigs.get(c);
      if (other !== undefined && hamming(sig, other) <= this._maxSigDist) {
        candidates.add(c);
      }
    }
    if (candidates.size > 0) path = 'signature';

    // Path 2 — ANN neighbors when signature produced nothing
    if (candidates.size === 0 && this._index.size > 0) {
      for (const h of this._index.knn(vec, this._candK)) {
        if (h.id !== id) candidates.add(h.id);
      }
      if (candidates.size > 0) path = 'ann';
    }

    // Path 3 — exact verify
    let best: string | undefined;
    let bestSim = 0;
    for (const c of candidates) {
      const cv = this._index.get(c);
      if (cv === undefined) continue;
      const s = cosine(vec, cv);
      if (s > bestSim) {
        bestSim = s;
        best = c;
      }
    }

    const dup = best !== undefined && bestSim >= this._threshold;
    if (!add) {
      return {
        duplicate: dup,
        match: dup ? best : undefined,
        similarity: bestSim,
        cluster: dup ? this._find(best!) : undefined,
        path: dup ? path : 'none',
      };
    }

    this._sigs.set(id, sig);
    this._index.add(id, vec);
    this._indexBands(id, sig);
    if (dup) {
      const leader = this._union(id, best!);
      const cur = this._maxSim.get(leader) ?? 0;
      if (bestSim > cur) this._maxSim.set(leader, bestSim);
      return {
        duplicate: true,
        match: best,
        similarity: bestSim,
        cluster: leader,
        path,
      };
    }
    this._parent.set(id, id);
    this._members.set(id, [id]);
    this._maxSim.set(id, 0);
    return { duplicate: false, similarity: bestSim, cluster: id, path };
  }

  /* ---------------------------------------------------------------- */
  /* Queries                                                           */
  /* ---------------------------------------------------------------- */

  /** All duplicate clusters with ≥2 members. */
  clusters(): DuplicateCluster[] {
    const out: DuplicateCluster[] = [];
    for (const [leader, members] of this._members) {
      if (members.length >= 2) {
        out.push({
          canonical: leader,
          members,
          maxSimilarity: this._maxSim.get(leader) ?? 0,
        });
      }
    }
    return out;
  }

  /** Cluster a doc belongs to (its own id when unique). */
  clusterOf(id: string): string | undefined {
    if (!this._sigs.has(id)) return undefined;
    return this._find(id);
  }

  /** True when `id` was indexed as a near-duplicate of something else. */
  isDuplicate(id: string): boolean {
    if (!this._sigs.has(id)) return false;
    const leader = this._find(id);
    return leader !== id || (this._members.get(leader)?.length ?? 0) > 1;
  }

  /** Similarity between two indexed docs (exact cosine, no caching). */
  similarity(a: string, b: string): number | undefined {
    const va = this._index.get(a);
    const vb = this._index.get(b);
    if (va === undefined || vb === undefined) return undefined;
    return cosine(va, vb);
  }

  /* ---------------------------------------------------------------- */
  /* Internals — signatures                                            */
  /* ---------------------------------------------------------------- */

  /** simhash-style sketch: sign of each hyperplane projection. */
  private _signature(vec: ArrayLike<number>): Uint32Array {
    const words = new Uint32Array(Math.ceil(this._sigSize / 32));
    for (let p = 0; p < this._sigSize; p++) {
      const plane = this._planes[p];
      let s = 0;
      for (let i = 0; i < this._dims; i++) s += vec[i] * plane[i];
      if (s >= 0) words[p >>> 5] |= 1 << (p & 31);
    }
    return words;
  }

  /** Hash each 8-bit band and union the bucket members. */
  private _bandCandidates(sig: Uint32Array): string[] {
    const out = new Set<string>();
    for (let b = 0; b < Math.ceil(this._sigSize / BANDS); b++) {
      const key = bandBits(sig, b, this._sigSize);
      const bucket = this._bands.get(b)!.get(key);
      if (bucket !== undefined) for (const id of bucket) out.add(id);
    }
    return [...out];
  }

  private _indexBands(id: string, sig: Uint32Array): void {
    for (let b = 0; b < Math.ceil(this._sigSize / BANDS); b++) {
      const key = bandBits(sig, b, this._sigSize);
      const tbl = this._bands.get(b)!;
      let bucket = tbl.get(key);
      if (bucket === undefined) {
        bucket = new Set();
        tbl.set(key, bucket);
      }
      bucket.add(id);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Internals — union-find                                            */
  /* ---------------------------------------------------------------- */

  private _find(id: string): string {
    let p = this._parent.get(id) ?? id;
    let root = p;
    while (root !== (this._parent.get(root) ?? root)) {
      root = this._parent.get(root)!;
    }
    // path compression
    while (p !== root) {
      const next = this._parent.get(p) ?? p;
      this._parent.set(p, root);
      p = next;
    }
    return root;
  }

  /** Union the clusters of a and b under the older (first-seen) leader. */
  private _union(a: string, b: string): string {
    const ra = this._find(a);
    const rb = this._find(b);
    if (ra === rb) return ra;
    // rb is the established cluster (b was indexed first); keep it.
    this._parent.set(ra, rb);
    const members = this._members.get(rb) ?? [];
    const moved = this._members.get(ra) ?? [a];
    this._members.set(rb, members.concat(moved));
    this._members.delete(ra);
    const sim = Math.max(this._maxSim.get(ra) ?? 0, this._maxSim.get(rb) ?? 0);
    this._maxSim.set(rb, sim);
    this._maxSim.delete(ra);
    return rb;
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Extract the 8-bit band slice `b` of a packed signature. */
function bandBits(sig: Uint32Array, band: number, sigSize: number): number {
  const start = band * BANDS;
  const width = Math.min(BANDS, sigSize - start);
  let v = 0;
  for (let i = 0; i < width; i++) {
    const bit = start + i;
    if ((sig[bit >>> 5] & (1 << (bit & 31))) !== 0) v |= 1 << i;
  }
  return v;
}

/** Hamming distance between two packed signatures. */
function hamming(a: Uint32Array, b: Uint32Array): number {
  let d = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    let x = a[i] ^ b[i];
    while (x !== 0) {
      x &= x - 1;
      d++;
    }
  }
  return d;
}

function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
