/**
 * EmbeddingCache — query→vector memoization in front of an embedder.
 *
 * Embedding inference (ONNX, remote API) dominates semantic-search
 * latency; production query logs are heavily Zipf-distributed — a small
 * slice of queries ("shoes", "iphone 15") produces most requests — so
 * even a modest in-memory cache absorbs the majority of embedder calls.
 *
 * Eviction is LRU over a Map+linked list (same O(1) dance as
 * `LRUCacheStrategy`): Map gives O(1) lookup, the list maintains
 * recency order. TTL expiry is lazy on read plus a sweep for callers
 * that want deterministic reclamation.
 *
 * The embedder is injected (`embed(text) → number[]`) — the cache
 * stays transport-agnostic and tests use deterministic fake embedders.
 * Cache keys are normalized (trim + lowercase + whitespace collapse):
 * " iPhone 15 " and "iphone 15" must share one embedding.
 *
 * @module SearchLayer/Engine
 */

import {
  EmbeddingCacheOptions,
  EmbeddingCacheStats,
  SearchClock,
} from './types';

class SystemSearchClock implements SearchClock {
  now(): number {
    return Date.now();
  }
}

interface CacheNode {
  key: string;
  vec: Float64Array;
  at: number;
  prev: CacheNode | null;
  next: CacheNode | null;
}

export type EmbedFn = (text: string) => ArrayLike<number>;

export class EmbeddingCache {
  private readonly _capacity: number;
  private readonly _ttl: number;
  private readonly _dims: number;
  private readonly _clock: SearchClock;
  private readonly _nodes = new Map<string, CacheNode>();
  private _head: CacheNode | null = null;
  private _tail: CacheNode | null = null;
  private _hits = 0;
  private _misses = 0;
  private _evictions = 0;
  private _expirations = 0;

  constructor(options: EmbeddingCacheOptions = {}, clock?: SearchClock) {
    this._capacity = Math.max(1, options.capacity ?? 1024);
    this._ttl = options.ttlMs ?? 0;
    this._dims = options.dims ?? 0;
    this._clock = clock ?? new SystemSearchClock();
  }

  /* ---------------------------------------------------------------- */
  /* Lookups                                                           */
  /* ---------------------------------------------------------------- */

  /**
   * Cached embedding for `text`, or embedder-produced on miss.
   * The returned array is a copy — callers can't corrupt the cache.
   */
  embed(text: string, embed: EmbedFn): Float64Array {
    const key = normalize(text);
    const node = this._nodes.get(key);
    if (node !== undefined) {
      if (!this._expired(node)) {
        this._touch(node);
        this._hits++;
        return node.vec.slice();
      }
      this._unlink(node);
      this._expirations++;
    }
    this._misses++;
    const vec = Float64Array.from(embed(text) as ArrayLike<number> as number[]);
    if (this._dims > 0 && vec.length !== this._dims) {
      throw new Error(`embedder dim ${vec.length} != expected ${this._dims}`);
    }
    this._insert(key, vec);
    return vec.slice();
  }

  /** Async variant — wraps remote embedders without fake-promise sync. */
  async embedAsync(
    text: string,
    embed: (text: string) => Promise<ArrayLike<number>>
  ): Promise<Float64Array> {
    const key = normalize(text);
    const node = this._nodes.get(key);
    if (node !== undefined && !this._expired(node)) {
      this._touch(node);
      this._hits++;
      return node.vec.slice();
    }
    if (node !== undefined) {
      this._unlink(node);
      this._expirations++;
    }
    this._misses++;
    const vec = Float64Array.from(
      (await embed(text)) as ArrayLike<number> as number[]
    );
    if (this._dims > 0 && vec.length !== this._dims) {
      throw new Error(`embedder dim ${vec.length} != expected ${this._dims}`);
    }
    this._insert(key, vec);
    return vec.slice();
  }

  /** Peek without recording stats or touching recency (debugging). */
  peek(text: string): Float64Array | undefined {
    const node = this._nodes.get(normalize(text));
    if (node === undefined || this._expired(node)) return undefined;
    return node.vec.slice();
  }

  /** Prime the cache with a batch (index warmup, offline embeddings). */
  preload(entries: ReadonlyArray<readonly [string, ArrayLike<number>]>): void {
    for (const [text, vec] of entries) {
      const v = Float64Array.from(vec as ArrayLike<number> as number[]);
      if (this._dims > 0 && v.length !== this._dims) {
        throw new Error(`preload dim ${v.length} != expected ${this._dims}`);
      }
      this._insert(normalize(text), v);
    }
  }

  invalidate(text: string): boolean {
    const node = this._nodes.get(normalize(text));
    if (node === undefined) return false;
    this._unlink(node);
    return true;
  }

  clear(): void {
    this._nodes.clear();
    this._head = null;
    this._tail = null;
  }

  /** Sweep expired entries; returns count removed. */
  sweep(): number {
    const now = this._clock.now();
    let n = 0;
    for (const [key, node] of [...this._nodes]) {
      if (this._ttl > 0 && now - node.at > this._ttl) {
        this._unlink(node);
        n++;
      }
      void key;
    }
    this._expirations += n;
    return n;
  }

  stats(): EmbeddingCacheStats {
    const total = this._hits + this._misses;
    return {
      hits: this._hits,
      misses: this._misses,
      evictions: this._evictions,
      expirations: this._expirations,
      size: this._nodes.size,
      hitRate: total === 0 ? 0 : this._hits / total,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Internals — LRU list                                              */
  /* ---------------------------------------------------------------- */

  private _insert(key: string, vec: Float64Array): void {
    const existing = this._nodes.get(key);
    if (existing !== undefined) {
      existing.vec = vec;
      existing.at = this._clock.now();
      this._touch(existing);
      return;
    }
    while (this._nodes.size >= this._capacity) {
      this._unlink(this._tail!);
      this._evictions++;
    }
    const node: CacheNode = { key, vec, at: this._clock.now(), prev: null, next: null };
    this._nodes.set(key, node);
    this._pushHead(node);
  }

  private _expired(node: CacheNode): boolean {
    return this._ttl > 0 && this._clock.now() - node.at > this._ttl;
  }

  private _pushHead(node: CacheNode): void {
    node.prev = null;
    node.next = this._head;
    if (this._head !== null) this._head.prev = node;
    this._head = node;
    if (this._tail === null) this._tail = node;
  }

  private _unlink(node: CacheNode): void {
    if (node.prev !== null) node.prev.next = node.next;
    else this._head = node.next;
    if (node.next !== null) node.next.prev = node.prev;
    else this._tail = node.prev;
    node.prev = null;
    node.next = null;
    this._nodes.delete(node.key);
  }

  /** move node to head without removal from map. */
  private _touch(node: CacheNode): void {
    if (node === this._head) return;
    if (node.prev !== null) node.prev.next = node.next;
    else this._head = node.next;
    if (node.next !== null) node.next.prev = node.prev;
    else this._tail = node.prev;
    this._pushHead(node);
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Key normalization: trim, collapse whitespace, lowercase. This is the
 * cheap half of query canonicalization — enough to unify typing noise
 * without stemming or language detection.
 */
function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}
