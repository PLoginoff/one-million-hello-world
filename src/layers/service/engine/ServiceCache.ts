/**
 * Service-Level Cache — key-template caching with TTL and stale-while-
 * revalidate.
 *
 * Wraps a service operation with a lookup keyed by a *template*:
 * `keyTemplate: 'user:{id}:profile'` renders against named args so the
 * cache key reads like the resource, not a hash. Two different arg
 * orders can produce the same key only if the template maps them the
 * same — the template is the contract.
 *
 * Entry lifecycle:
 *   fresh ──(TTL)──► stale ──(staleTTL)──► evicted
 *
 * `swr` (stale-while-revalidate) returns the stale value immediately
 * and refreshes in the background — bounded staleness beats a slow
 * synchronous recompute under load.
 *
 * Eviction: bounded LRU. The map preserves insertion order and a hit
 * re-inserts the key at the tail — the oldest-by-use entry is always
 * the first key, so eviction is O(1).
 *
 * @module ServiceLayer/Engine
 */

import { Clock, SystemClock } from './TransactionScriptRunner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One cache entry. */
interface CacheEntry<V> {
  readonly value: V;
  readonly storedAtMs: number;
  readonly ttlMs: number;
  readonly staleMs: number;
  readonly hits: number;
}

/** Options for {@link ServiceCache}. */
export interface ServiceCacheOptions {
  /** Default TTL in ms. */
  readonly ttlMs: number;
  /** Additional stale window for SWR (ms, default 0 = off). */
  readonly staleMs?: number;
  /** Max entries; oldest-by-use evicts. */
  readonly maxEntries?: number;
  /** Clock injection. */
  readonly clock?: Clock;
}

/** Render context for key templates. */
export interface KeyTemplateContext {
  readonly args: Record<string, unknown>;
  readonly service: string;
  readonly operation: string;
}

/** Key template — literal text + `{name}` placeholders. */
export type KeyTemplate = string;

/** Options for a cached invocation. */
export interface CachedCallOptions<A extends readonly unknown[]> {
  readonly service: string;
  readonly operation: string;
  readonly keyTemplate: KeyTemplate;
  /** Map positional args to template names (`['id']` → `{id}` = args[0]). */
  readonly argNames?: readonly string[];
  readonly loader: (...args: A) => Promise<unknown>;
  readonly args: A;
}

/** Cache stats. */
export interface ServiceCacheStats {
  readonly size: number;
  readonly hits: number;
  readonly misses: number;
  readonly staleHits: number;
  readonly evictions: number;
  readonly hitRate: number;
}

// ---------------------------------------------------------------------------
// Template renderer
// ---------------------------------------------------------------------------

/**
 * Render `'user:{id}:profile'` against named args.
 * Unknown placeholders are left as-is (visible misconfig > silent loss).
 */
export function renderKeyTemplate(
  template: KeyTemplate,
  ctx: KeyTemplateContext
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)(?::([^}]*))?\}/g, (match, name: string, alt: string | undefined) => {
    // `{service}` / `{operation}` are built-in; `{op}` is an alias.
    if (name === 'service') {
      return ctx.service;
    }
    if (name === 'operation' || name === 'op') {
      return ctx.operation;
    }
    const v = ctx.args[name];
    if (v === undefined) {
      // `{name:fallback}` renders the fallback; bare `{name}` stays
      // literal so a misconfigured key is visible rather than silent.
      return alt ?? match;
    }
    return String(v);
  });
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * Service-level LRU cache with TTL + SWR.
 *
 * `Map` insertion-order LRU: `get` re-inserts at tail; `set` past
 * capacity evicts `keys().next().value` — the least-recently-used.
 * O(1) get/set/evict.
 */
export class ServiceCache {
  private readonly _entries: Map<string, CacheEntry<unknown>>;
  private readonly _ttlMs: number;
  private readonly _staleMs: number;
  private readonly _maxEntries: number;
  private readonly _clock: Clock;
  private _hits: number;
  private _misses: number;
  private _staleHits: number;
  private _evictions: number;

  constructor(options: ServiceCacheOptions) {
    this._entries = new Map();
    this._ttlMs = options.ttlMs;
    this._staleMs = options.staleMs ?? 0;
    this._maxEntries = options.maxEntries ?? 1024;
    this._clock = options.clock ?? new SystemClock();
    this._hits = 0;
    this._misses = 0;
    this._staleHits = 0;
    this._evictions = 0;
  }

  get size(): number {
    return this._entries.size;
  }

  /**
   * Render the key and return the cached value when fresh, the stale
   * value with a background revalidate when in the SWR window, or
   * compute synchronously on a cold miss.
   */
  async call<A extends readonly unknown[], R>(
    options: CachedCallOptions<A>
  ): Promise<{ value: R; cache: 'hit' | 'stale' | 'miss' }> {
    const argMap: Record<string, unknown> = {};
    const names = options.argNames ?? [];
    for (let i = 0; i < options.args.length; i++) {
      const name = names[i] ?? `arg${i}`;
      argMap[name] = options.args[i];
    }
    const key = renderKeyTemplate(options.keyTemplate, {
      args: argMap,
      service: options.service,
      operation: options.operation,
    });

    const now = this._clock.now();
    const entry = this._entries.get(key);
    if (entry !== undefined) {
      const age = now - entry.storedAtMs;
      if (age <= entry.ttlMs) {
        this._hits += 1;
        this.touch(key, entry);
        return { value: entry.value as R, cache: 'hit' };
      }
      if (this._staleMs > 0 && age <= entry.ttlMs + this._staleMs) {
        this._staleHits += 1;
        // Async revalidation — fire-and-forget; failure leaves the stale
        // entry in place rather than poisoning the cache.
        void this.refresh(key, options).catch(() => undefined);
        return { value: entry.value as R, cache: 'stale' };
      }
      // Past the stale window — evict and treat as a miss.
      this._entries.delete(key);
      this._evictions += 1;
    }

    this._misses += 1;
    const value = (await options.loader(...options.args)) as R;
    this.store(key, value);
    return { value, cache: 'miss' };
  }

  /** Peek at a key's entry state (diagnostics). */
  peek(key: string): { fresh: boolean; stale: boolean; ageMs: number } | undefined {
    const entry = this._entries.get(key);
    if (entry === undefined) {
      return undefined;
    }
    const ageMs = this._clock.now() - entry.storedAtMs;
    return {
      ageMs,
      fresh: ageMs <= entry.ttlMs,
      stale: this._staleMs > 0 && ageMs <= entry.ttlMs + entry.staleMs,
    };
  }

  /** Invalidate one rendered key. */
  invalidate(key: string): boolean {
    return this._entries.delete(key);
  }

  clear(): void {
    this._entries.clear();
  }

  stats(): ServiceCacheStats {
    const total = this._hits + this._misses + this._staleHits;
    return {
      size: this._entries.size,
      hits: this._hits,
      misses: this._misses,
      staleHits: this._staleHits,
      evictions: this._evictions,
      hitRate: total === 0 ? 0 : (this._hits + this._staleHits) / total,
    };
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private store(key: string, value: unknown): void {
    if (this._entries.size >= this._maxEntries) {
      // Evict the least-recently-used — first key in insertion order.
      const oldest = this._entries.keys().next();
      if (!oldest.done) {
        this._entries.delete(oldest.value);
        this._evictions += 1;
      }
    }
    this._entries.set(key, {
      value,
      storedAtMs: this._clock.now(),
      ttlMs: this._ttlMs,
      staleMs: this._staleMs,
      hits: 0,
    });
  }

  /** Re-insert at the tail to mark the entry as most-recently-used. */
  private touch(key: string, entry: CacheEntry<unknown>): void {
    this._entries.delete(key);
    this._entries.set(key, { ...entry, hits: entry.hits + 1 });
  }

  /** Background refresh — overwrites the entry on success only. */
  private async refresh<A extends readonly unknown[]>(
    key: string,
    options: CachedCallOptions<A>
  ): Promise<void> {
    const value = await options.loader(...options.args);
    this.store(key, value);
  }
}
