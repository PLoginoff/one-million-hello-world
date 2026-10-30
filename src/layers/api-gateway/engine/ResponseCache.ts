/**
 * Gateway Response Cache
 *
 * Caches upstream responses keyed by
 * `(routeId, consumerId, varyHeaders...)` plus method and normalized
 * query string — so two requests to the same route differing only in
 * non-vary headers share an entry.
 *
 * The set of headers that contribute to the key is derived from the
 * upstream's `Vary` response header at write time. Before `Vary` is
 * known, entries are keyed by an empty vary-set and stored pending;
 * the first response establishes the vary list.
 *
 * Implementation: Map for O(1) lookup + intrusive doubly-linked list
 * for LRU eviction (same technique as LRUCacheStrategy). TTL is
 * honored lazily on read.
 *
 * @module ApiGatewayLayer/Engine
 */

import { GatewayClock, SystemGatewayClock, GatewayResponse } from './types';

/** Lookup input describing the request. */
export interface CacheLookup {
  readonly routeId: string;
  readonly consumerId?: string;
  readonly method: string;
  readonly path: string;
  readonly query: Record<string, string>;
  readonly headers: Record<string, string[]>;
}

interface CacheNode {
  key: string;
  varyKey: string;
  response: CachedResponse;
  expiresAt: number;
  prev: CacheNode | null;
  next: CacheNode | null;
}

export interface CachedResponse extends GatewayResponse {
  readonly storedAt: number;
  readonly ttlMs: number;
  /** Vary header list captured from the stored response. */
  readonly vary: readonly string[];
}

export interface ResponseCacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly size: number;
  readonly evictions: number;
}

const DEFAULT_CAPACITY = 1000;
const DEFAULT_TTL_MS = 60_000;

/** Normalize a query map to a canonical `a=1&b=2` string. */
function canonicalQuery(query: Record<string, string>): string {
  return Object.keys(query)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(query[k]!)}`)
    .join('&');
}

/** Build the base (pre-vary) cache key. */
function baseKey(lookup: CacheLookup): string {
  return [
    lookup.method.toUpperCase(),
    lookup.routeId,
    lookup.consumerId ?? '-',
    lookup.path,
    canonicalQuery(lookup.query),
  ].join('|');
}

/** Build the vary portion from a header map. */
function varySuffix(
  vary: readonly string[],
  headers: Record<string, string[]>
): string {
  return vary
    .map((name) => `${name.toLowerCase()}=${(headers[name.toLowerCase()] ?? []).join(',')}`)
    .join('|');
}

/**
 * Gateway response cache.
 *
 * Two-level keying: `baseKey -> Map<varyKey -> node>` so multiple
 * variants of the same request can coexist.
 */
export class GatewayResponseCache {
  private _entries: Map<string, Map<string, CacheNode>>;
  private _capacity: number;
  private _defaultTtlMs: number;
  private _clock: GatewayClock;
  private _head: CacheNode | null;
  private _tail: CacheNode | null;
  private _size: number;
  private _hits: number;
  private _misses: number;
  private _evictions: number;
  /** Remembered vary lists per route (learned from responses). */
  private _varyByRoute: Map<string, string[]>;

  constructor(options?: {
    capacity?: number;
    defaultTtlMs?: number;
    clock?: GatewayClock;
  }) {
    this._entries = new Map();
    this._capacity = Math.max(1, options?.capacity ?? DEFAULT_CAPACITY);
    this._defaultTtlMs = options?.defaultTtlMs ?? DEFAULT_TTL_MS;
    this._clock = options?.clock ?? new SystemGatewayClock();
    this._head = null;
    this._tail = null;
    this._size = 0;
    this._hits = 0;
    this._misses = 0;
    this._evictions = 0;
    this._varyByRoute = new Map();
  }

  /**
   * Look up a cached response. Returns undefined on miss/expiry.
   */
  get(lookup: CacheLookup): CachedResponse | undefined {
    const bk = baseKey(lookup);
    const variants = this._entries.get(bk);
    if (!variants) {
      this._misses++;
      return undefined;
    }
    const vary = this._varyByRoute.get(lookup.routeId) ?? [];
    const vk = varySuffix(vary, lookup.headers);
    const node = variants.get(vk);
    if (!node) {
      // Fallback: when only one variant exists it may predate the
      // learned vary list — try the empty vary key too.
      const fallback = variants.get('');
      if (!fallback) {
        this._misses++;
        return undefined;
      }
      return this._readNode(fallback, bk, variants);
    }
    return this._readNode(node, bk, variants);
  }

  /**
   * Store a response. Learns `Vary` from the response headers.
   * Respects `cache-control: no-store` on the response.
   */
  set(lookup: CacheLookup, response: GatewayResponse, ttlMs?: number): boolean {
    const cc = response.headers['cache-control']?.[0] ?? '';
    if (/no-store|private/i.test(cc)) return false;

    const varyHeader = response.headers['vary'];
    const vary = varyHeader
      ? varyHeader.flatMap((v) => v.split(',')).map((v) => v.trim().toLowerCase()).filter(Boolean)
      : (this._varyByRoute.get(lookup.routeId) ?? []);
    if (vary.length > 0) {
      this._varyByRoute.set(lookup.routeId, vary);
    }
    if (vary.includes('*')) return false;

    const bk = baseKey(lookup);
    const vk = varySuffix(vary, lookup.headers);
    let variants = this._entries.get(bk);
    if (!variants) {
      variants = new Map();
      this._entries.set(bk, variants);
    }

    const effectiveTtl = ttlMs ?? this._defaultTtlMs;
    const now = this._clock.now();
    const existing = variants.get(vk);
    const cached: CachedResponse = {
      ...response,
      storedAt: now,
      ttlMs: effectiveTtl,
      vary,
    };

    if (existing) {
      existing.response = cached;
      existing.expiresAt = now + effectiveTtl;
      this._touch(existing);
      return true;
    }

    if (this._size >= this._capacity) {
      this._evict();
    }

    const node: CacheNode = {
      key: bk,
      varyKey: vk,
      response: cached,
      expiresAt: now + effectiveTtl,
      prev: null,
      next: null,
    };
    variants.set(vk, node);
    this._addToHead(node);
    this._size++;
    return true;
  }

  /** Invalidate every variant of a base key (e.g. on route update). */
  invalidate(lookup: Pick<CacheLookup, 'routeId' | 'method' | 'path' | 'query'> & Partial<CacheLookup>): number {
    const bk = baseKey({
      consumerId: lookup.consumerId,
      method: lookup.method,
      path: lookup.path,
      query: lookup.query,
      routeId: lookup.routeId,
      headers: {},
    });
    const variants = this._entries.get(bk);
    if (!variants) return 0;
    let removed = 0;
    for (const node of [...variants.values()]) {
      this._unlink(node);
      removed++;
    }
    this._entries.delete(bk);
    return removed;
  }

  /** Flush the whole cache. */
  clear(): void {
    this._entries.clear();
    this._varyByRoute.clear();
    this._head = null;
    this._tail = null;
    this._size = 0;
  }

  /** Remove expired entries. O(n). Returns count removed. */
  purgeExpired(): number {
    const now = this._clock.now();
    let removed = 0;
    for (const [bk, variants] of [...this._entries]) {
      for (const [vk, node] of [...variants]) {
        if (node.expiresAt <= now) {
          this._unlink(node);
          variants.delete(vk);
          removed++;
        }
      }
      if (variants.size === 0) this._entries.delete(bk);
    }
    return removed;
  }

  stats(): ResponseCacheStats {
    return {
      hits: this._hits,
      misses: this._misses,
      size: this._size,
      evictions: this._evictions,
    };
  }

  private _readNode(
    node: CacheNode,
    bk: string,
    variants: Map<string, CacheNode>
  ): CachedResponse | undefined {
    const now = this._clock.now();
    if (node.expiresAt <= now) {
      this._unlink(node);
      variants.delete(node.varyKey);
      if (variants.size === 0) this._entries.delete(bk);
      this._misses++;
      return undefined;
    }
    this._touch(node);
    this._hits++;
    return node.response;
  }

  private _addToHead(node: CacheNode): void {
    node.prev = null;
    node.next = this._head;
    if (this._head) this._head.prev = node;
    this._head = node;
    if (!this._tail) this._tail = node;
  }

  private _unlink(node: CacheNode): void {
    if (node.prev) node.prev.next = node.next;
    else this._head = node.next;
    if (node.next) node.next.prev = node.prev;
    else this._tail = node.prev;
    node.prev = null;
    node.next = null;
    this._size--;
  }

  private _touch(node: CacheNode): void {
    if (node === this._head) return;
    if (node.prev) node.prev.next = node.next;
    if (node.next) node.next.prev = node.prev;
    else this._tail = node.prev;
    node.prev = null;
    node.next = this._head;
    if (this._head) this._head.prev = node;
    this._head = node;
  }

  private _evict(): void {
    const victim = this._tail;
    if (!victim) return;
    const variants = this._entries.get(victim.key);
    if (variants) {
      variants.delete(victim.varyKey);
      if (variants.size === 0) this._entries.delete(victim.key);
    }
    this._unlink(victim);
    this._evictions++;
  }
}
