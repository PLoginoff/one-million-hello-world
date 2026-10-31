/**
 * Idempotency-Keyed Request Deduplication
 *
 * Gateway-side deduplication for unsafe-but-retryable methods (POST,
 * PATCH): when a client sends an `Idempotency-Key` header, the first
 * request proceeds to the upstream and its response is stored;
 * subsequent requests bearing the same key *and* the same request
 * fingerprint (method + path + body hash) replay the stored response
 * without touching the upstream.
 *
 * Semantics modeled on Stripe's idempotency API and IETF draft
 * `draft-ietf-httpapi-idempotency-key-header`:
 *
 *  - `miss`       — key unseen; caller proceeds then calls `store()`
 *  - `hit`        — same key + fingerprint; replay stored response
 *  - `in-flight`  — same key + fingerprint, first request still in
 *                   progress; caller awaits `promise()` which resolves
 *                   once `store()` lands
 *  - `conflict`   — same key, different fingerprint: the client is
 *                   reusing a key for a *different* request — an error
 *
 * Entries expire on a TTL; an expired entry is treated as absent.
 * Storage is a Map with lazy expiry on read plus `sweep()` for bulk
 * eviction — O(1) check/store, O(n) sweep.
 *
 * @module ApiGatewayLayer/Engine3
 */

import { createHash } from 'crypto';
import {
  DedupOutcome,
  GatewayClock3,
  IdempotencyStats,
  StoredResponse,
  SystemGatewayClock3,
} from './types3';

interface Entry {
  fingerprint: string;
  response?: StoredResponse;
  /** Resolves the in-flight waiter once `store()` lands. */
  resolve?: (r: StoredResponse) => void;
  promise?: Promise<StoredResponse>;
}

export interface IdempotencyOptions {
  readonly clock?: GatewayClock3;
  /** Entry TTL in ms (default 24h). */
  readonly ttlMs?: number;
}

/**
 * Stable fingerprint of a request: SHA-256 over method + canonical
 * path + body. Two requests are "the same" iff fingerprints match.
 */
export function requestFingerprint(method: string, path: string, body: string | undefined): string {
  return createHash('sha256')
    .update(method.toUpperCase())
    .update('\0')
    .update(path)
    .update('\0')
    .update(body ?? '')
    .digest('hex');
}

export class IdempotencyStore {
  private readonly entries = new Map<string, Entry>();
  private readonly clock: GatewayClock3;
  private readonly ttlMs: number;
  private hits = 0;
  private misses = 0;
  private conflicts = 0;
  private expired = 0;

  constructor(options: IdempotencyOptions = {}) {
    this.clock = options.clock ?? new SystemGatewayClock3();
    this.ttlMs = options.ttlMs ?? 24 * 60 * 60 * 1000;
    if (this.ttlMs <= 0) throw new Error('ttlMs must be positive');
  }

  /**
   * Check an idempotency key before proxying. The caller must pass
   * the request fingerprint so key-reuse conflicts are detected.
   */
  check(key: string, fingerprint: string): DedupOutcome {
    const now = this.clock.now();
    const entry = this.entries.get(key);

    if (entry !== undefined) {
      if (entry.response !== undefined && entry.response.expiresAt <= now) {
        // Expired: treat as absent, evict.
        this.entries.delete(key);
        this.expired++;
      } else if (entry.fingerprint !== fingerprint) {
        this.conflicts++;
        return { kind: 'conflict', fingerprint };
      } else if (entry.response !== undefined) {
        this.hits++;
        return { kind: 'hit', response: entry.response };
      } else {
        return { kind: 'in-flight', fingerprint };
      }
    }

    this.misses++;
    // Reserve the key with a pending promise for in-flight waiters.
    let resolve: ((r: StoredResponse) => void) | undefined;
    const promise = new Promise<StoredResponse>((res) => {
      resolve = res;
    });
    this.entries.set(key, { fingerprint, resolve, promise });
    return { kind: 'miss', fingerprint };
  }

  /**
   * Store the upstream response for a previously-missed key.
   * Resolves any in-flight waiters.
   */
  store(
    key: string,
    response: { status: number; headers?: Record<string, string>; body: string }
  ): StoredResponse {
    const entry = this.entries.get(key);
    const now = this.clock.now();
    const stored: StoredResponse = {
      status: response.status,
      headers: response.headers ?? {},
      body: response.body,
      storedAt: now,
      expiresAt: now + this.ttlMs,
    };
    if (entry) {
      entry.response = stored;
      entry.resolve?.(stored);
      entry.resolve = undefined;
      // Keep the promise field for late callers — already resolved.
    } else {
      this.entries.set(key, { fingerprint: '', response: stored });
    }
    return stored;
  }

  /**
   * Await the response for an in-flight key. Resolves `undefined` if
   * the key is unknown (caller raced a sweep) — treat as a miss and
   * retry `check()`.
   */
  async wait(key: string): Promise<StoredResponse | undefined> {
    return this.entries.get(key)?.promise;
  }

  /**
   * Abandon a reserved key — e.g. the upstream call failed and the
   * client *should* retry. Wakes waiters with a synthesized 503 so
   * they don't hang forever.
   */
  release(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    if (entry.resolve) {
      const now = this.clock.now();
      entry.resolve({
        status: 503,
        headers: {},
        body: '{"error":"upstream request failed before response"}',
        storedAt: now,
        expiresAt: now,
      });
    }
  }

  /** Look up a stored response without affecting hit counters. */
  peek(key: string): StoredResponse | undefined {
    return this.entries.get(key)?.response;
  }

  /** Evict all expired entries; returns count removed. */
  sweep(): number {
    const now = this.clock.now();
    let removed = 0;
    for (const [k, e] of this.entries) {
      if (e.response !== undefined && e.response.expiresAt <= now) {
        this.entries.delete(k);
        removed++;
        this.expired++;
      }
    }
    return removed;
  }

  stats(): IdempotencyStats {
    let inFlight = 0;
    for (const e of this.entries.values()) {
      if (e.response === undefined) inFlight++;
    }
    return {
      entries: this.entries.size,
      inFlight,
      hits: this.hits,
      misses: this.misses,
      conflicts: this.conflicts,
      expired: this.expired,
    };
  }

  clear(): void {
    this.entries.clear();
  }
}
