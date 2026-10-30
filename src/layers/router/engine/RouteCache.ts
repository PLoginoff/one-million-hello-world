/**
 * LRU Route Cache
 *
 * Caches `(method, path) -> MatchResult` resolutions so hot paths skip
 * the trie walk entirely. Uses a Map (insertion-ordered) with the
 * delete-and-reinsert trick for O(1) promotion, matching the
 * linked-list approach in `LRUCacheStrategy` but leveraging the
 * engine's built-in ordering.
 *
 * Invalidation:
 * - `register`/`remove` on the router must call `invalidate()` — the
 *   engine wires this automatically.
 * - Not-found results are cached too (negative caching) since trie
 *   misses are the expensive case for pathological clients.
 *
 * @module RouterLayer/Engine
 */

import { HttpMethod } from '../types/router-types';
import { MatchResult, RouteCacheConfig, RouteCacheStats } from './types';

/**
 * Bounded LRU cache for route resolutions.
 */
export class RouteCache {
  private readonly _capacity: number;
  private readonly _entries: Map<string, MatchResult>;
  private _hits: number;
  private _misses: number;
  private _evictions: number;

  constructor(config?: Partial<RouteCacheConfig>) {
    this._capacity = config?.capacity ?? 512;
    if (this._capacity <= 0) {
      throw new Error('RouteCache capacity must be positive');
    }
    this._entries = new Map();
    this._hits = 0;
    this._misses = 0;
    this._evictions = 0;
  }

  /**
   * Resolve a (method, path) pair — returns the cached outcome or
   * `undefined` on miss. Promotes the entry on hit.
   */
  lookup(method: HttpMethod, path: string): MatchResult | undefined {
    const key = `${method} ${path}`;
    const hit = this._entries.get(key);
    if (hit === undefined) {
      this._misses++;
      return undefined;
    }
    // Promote: delete + reinsert moves the key to the tail (most recent).
    this._entries.delete(key);
    this._entries.set(key, hit);
    this._hits++;
    return hit;
  }

  /**
   * Store a resolution. Evicts the least-recently-used entry at capacity.
   */
  store(method: HttpMethod, path: string, result: MatchResult): void {
    const key = `${method} ${path}`;
    if (this._entries.has(key)) {
      this._entries.delete(key);
    } else if (this._entries.size >= this._capacity) {
      // Oldest entry is the first key in iteration order.
      const oldest = this._entries.keys().next();
      if (!oldest.done) {
        this._entries.delete(oldest.value);
        this._evictions++;
      }
    }
    this._entries.set(key, result);
  }

  /** Drop every cached resolution (route table changed). */
  invalidate(): void {
    this._entries.clear();
  }

  /** Statistics snapshot. */
  stats(): RouteCacheStats {
    return {
      hits: this._hits,
      misses: this._misses,
      size: this._entries.size,
      capacity: this._capacity,
      evictions: this._evictions,
    };
  }

  /** Hit ratio in [0, 1], or 0 when never queried. */
  hitRate(): number {
    const total = this._hits + this._misses;
    return total === 0 ? 0 : this._hits / total;
  }
}
