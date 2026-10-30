/**
 * Persisted Query Registry + APQ (Automatic Persisted Queries).
 *
 * Two related mechanisms:
 *
 *  1. Persisted registry: clients register query documents ahead of time
 *     and send only the SHA-256 hash at request time. Benefits: smaller
 *     requests (query text doesn't traverse the edge), and an implicit
 *     allowlist — production can *refuse* ad-hoc queries entirely.
 *
 *  2. APQ (Apollo protocol): the client optimistically sends just a hash;
 *     on a miss the server replies PersistedQueryNotFound and the client
 *     retries once with the full document, which the server registers
 *     and executes. Steady state = hash-only requests with zero
 *     round-trips beyond the first.
 *
 * Hash: SHA-256 of the *raw* query text (byte-exact — matches the Apollo
 * convention so cross-tool interop works). Registration is idempotent
 * and content-addressed: the hash *is* the key.
 *
 * Eviction: LRU by last-hit — registered queries outlive a session, but
 * the registry is bounded so a long-lived server doesn't grow forever.
 *
 * Complexity: O(1) lookup/register (Map + doubly-linked LRU list).
 *
 * @module GraphqlLayer/Engine2
 */

import { createHash } from 'crypto';

export function queryHash(queryText: string): string {
  return createHash('sha256').update(queryText, 'utf8').digest('hex');
}

export interface RegistryStats {
  readonly size: number;
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
  readonly hitRate: number;
}

interface Entry {
  hash: string;
  text: string;
  registeredAt: number;
  lastHitAt: number;
  hits: number;
  /** LRU list links. */
  prev: Entry | null;
  next: Entry | null;
}

export class PersistedQueryRegistry {
  private readonly _maxEntries: number;
  private readonly _entries = new Map<string, Entry>();
  private _head: Entry | null = null;
  private _tail: Entry | null = null;
  private _hits = 0;
  private _misses = 0;
  private _evictions = 0;
  private readonly _now: () => number;

  constructor(opts: { maxEntries?: number; now?: () => number } = {}) {
    this._maxEntries = opts.maxEntries ?? 10_000;
    this._now = opts.now ?? Date.now;
  }

  /** Register (or re-register) a query; returns its hash. */
  register(queryText: string): string {
    const hash = queryHash(queryText);
    const existing = this._entries.get(hash);
    if (existing) {
      this._touch(existing);
      return hash;
    }
    const entry: Entry = {
      hash,
      text: queryText,
      registeredAt: this._now(),
      lastHitAt: this._now(),
      hits: 0,
      prev: null,
      next: null,
    };
    this._entries.set(hash, entry);
    this._addHead(entry);
    while (this._entries.size > this._maxEntries) {
      this._evictTail();
    }
    return hash;
  }

  /** Resolve a hash to its query text — APQ hot path. */
  lookup(hash: string): string | null {
    const e = this._entries.get(hash);
    if (!e) {
      this._misses++;
      return null;
    }
    e.hits++;
    e.lastHitAt = this._now();
    this._hits++;
    this._touch(e);
    return e.text;
  }

  /**
   * APQ handshake: client sends `{ hash }` first. Returns:
   *   { status: 'hit', text }          — execute `text`
   *   { status: 'miss' }               — reply PersistedQueryNotFound,
   *                                      client retries with full query
   * Then, on the retry with the text, call {@link register}.
   */
  resolveHash(hash: string): { status: 'hit'; text: string } | { status: 'miss' } {
    const text = this.lookup(hash);
    return text !== null ? { status: 'hit', text } : { status: 'miss' };
  }

  /** Evict least-recently-used entries down to `targetSize`. */
  evictTo(targetSize: number): number {
    let n = 0;
    while (this._entries.size > targetSize && this._tail) {
      this._evictTail();
      n++;
    }
    return n;
  }

  stats(): RegistryStats {
    const total = this._hits + this._misses;
    return {
      size: this._entries.size,
      hits: this._hits,
      misses: this._misses,
      evictions: this._evictions,
      hitRate: total > 0 ? this._hits / total : 0,
    };
  }

  /* -------------------- doubly-linked LRU list -------------------- */

  private _addHead(e: Entry): void {
    e.prev = null;
    e.next = this._head;
    if (this._head) this._head.prev = e;
    this._head = e;
    if (!this._tail) this._tail = e;
  }

  private _remove(e: Entry): void {
    if (e.prev) e.prev.next = e.next;
    else this._head = e.next;
    if (e.next) e.next.prev = e.prev;
    else this._tail = e.prev;
    e.prev = e.next = null;
  }

  private _touch(e: Entry): void {
    if (e !== this._head) {
      this._remove(e);
      this._addHead(e);
    }
  }

  private _evictTail(): void {
    if (!this._tail) return;
    this._entries.delete(this._tail.hash);
    this._remove(this._tail);
    this._evictions++;
  }
}
