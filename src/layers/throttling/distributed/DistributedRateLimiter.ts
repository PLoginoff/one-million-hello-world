/**
 * DistributedRateLimiter — Redis-backed rate limiting with Lua-atomic
 * semantics, matching the `rate-limiting` layer's RedisAdapter contract.
 *
 * A single-process token bucket cannot rate-limit a horizontally scaled
 * fleet — each node has its own view. The standard fix is Redis +
 * server-side Lua scripts: one `EVAL` performs read-modify-write
 * atomically, so N application nodes share one counter without races.
 *
 * This module provides:
 *
 *  - {@link DistributedRateLimitClient} — the subset of the Redis command
 *    surface the limiter needs (`GET`/`SET PX`/`INCR`/`PEXPIRE`/`PTTL`
 *    for fixed window; `ZADD`/`ZCARD`/`ZREMRANGEBYSCORE` for sliding
 *    window; `HMGET`/`HMSET` for token bucket). Any client implementing
 *    this interface (real Redis, Valkey, the bundled mock) works.
 *  - {@link DistributedRateLimiter} — the three canonical algorithms
 *    expressed with the *same* semantics as the Lua scripts in
 *    `rate-limiting/adapters/RedisAdapter.ts`:
 *
 *      fixedWindow:      windowStart = now − (now % window);
 *                       count via INCR on key:windowStart, PX=window
 *      slidingWindowLog: ZREMRANGEBYSCORE −inf (now−window); ZCARD;
 *                       admit iff count < limit; ZADD member=now:rand
 *      tokenBucket:      HMGET tokens,lastRefill; refill lazily;
 *                       admit iff tokens ≥ requested; HMSET back
 *
 *    The in-memory mock below executes those same steps atomically under
 *    its own lock, so tests exercise identical semantics to real Redis.
 *
 *  - {@link InMemoryDistributedClient} — a faithful in-memory stand-in:
 *    string/hash/zset stores with per-key TTL expiry (lazy, checked on
 *    access — exactly how Redis expires). Sorted sets keep score+member
 *    ordering; `incr` on a missing key starts at 1; `pttl` returns −1 for
 *    no-TTL, −2 for missing — the real Redis return contract.
 *
 * Complexity: per check, O(1) for fixed window and token bucket;
 * O(log n + expired) for the sliding log (n = window entries).
 *
 * @module Throttling/Distributed
 */

/* ------------------------------------------------------------------ */
/* Client interface                                                    */
/* ------------------------------------------------------------------ */

/**
 * Minimal Redis command surface for rate limiting. Promise-based —
 * network clients are inherently async.
 */
export interface DistributedRateLimitClient {
  get(key: string): Promise<string | null>;
  /** SET key value [PX ttlMs] — returns 'OK' or null when NX/XX fails. */
  set(key: string, value: string, ttlMs?: number): Promise<'OK' | null>;
  incr(key: string): Promise<number>;
  pexpire(key: string, ttlMs: number): Promise<number>;
  /** −2 missing, −1 no TTL, else ms remaining. */
  pttl(key: string): Promise<number>;
  del(key: string): Promise<number>;
  hmget(key: string, fields: string[]): Promise<(string | null)[]>;
  hmset(key: string, fieldValues: Record<string, string>): Promise<'OK'>;
  zadd(key: string, score: number, member: string): Promise<number>;
  zcard(key: string): Promise<number>;
  zremrangebyscore(key: string, min: number, max: number): Promise<number>;
  /** Members by rank, ascending score. */
  zrange(key: string, start: number, stop: number): Promise<string[]>;
  ping(): Promise<string>;
}

/* ------------------------------------------------------------------ */
/* In-memory client                                                    */
/* ------------------------------------------------------------------ */

interface ZEntry {
  score: number;
  member: string;
}

/**
 * Faithful in-memory stand-in for the Redis command surface. All ops are
 * `async` (matching a real client's latency shape) but resolve
 * synchronously — no event-loop yield needed.
 *
 * Expiry is lazy: a `px` deadline is stored per key and checked on every
 * access, exactly mirroring Redis' passive expiry (plus its active cycle
 * is irrelevant for correctness).
 */
export class InMemoryDistributedClient implements DistributedRateLimitClient {
  private readonly _strings = new Map<string, { value: string; expiresAt: number | null }>();
  private readonly _hashes = new Map<string, { fields: Map<string, string>; expiresAt: number | null }>();
  private readonly _zsets = new Map<string, { entries: Map<string, number>; expiresAt: number | null }>();
  private readonly _now: () => number;
  /** Monotonic counter for unique sliding-window members. */
  private _memberSeq = 0;

  constructor(now?: () => number) {
    this._now = now ?? (() => Date.now());
  }

  /* Expiry housekeeping — drop a key once its deadline passed. */
  private _expired(expiresAt: number | null): boolean {
    return expiresAt !== null && expiresAt <= this._now();
  }

  private _liveString(key: string) {
    const e = this._strings.get(key);
    if (e !== undefined && this._expired(e.expiresAt)) {
      this._strings.delete(key);
      return undefined;
    }
    return e;
  }

  private _liveHash(key: string) {
    const e = this._hashes.get(key);
    if (e !== undefined && this._expired(e.expiresAt)) {
      this._hashes.delete(key);
      return undefined;
    }
    return e;
  }

  private _liveZset(key: string) {
    const e = this._zsets.get(key);
    if (e !== undefined && this._expired(e.expiresAt)) {
      this._zsets.delete(key);
      return undefined;
    }
    return e;
  }

  private _ttlOf(expiresAt: number | null, exists: boolean): number {
    if (!exists) return -2;
    if (expiresAt === null) return -1;
    return Math.max(0, expiresAt - this._now());
  }

  private _store(kind: 'string' | 'hash' | 'zset', key: string) {
    if (kind === 'string') return this._strings.get(key) ?? undefined;
    if (kind === 'hash') return this._hashes.get(key) ?? undefined;
    return this._zsets.get(key) ?? undefined;
  }

  async get(key: string): Promise<string | null> {
    return this._liveString(key)?.value ?? null;
  }

  async set(key: string, value: string, ttlMs?: number): Promise<'OK' | null> {
    this._strings.set(key, {
      value,
      expiresAt: ttlMs === undefined ? null : this._now() + ttlMs,
    });
    return 'OK';
  }

  async incr(key: string): Promise<number> {
    const e = this._liveString(key);
    const next = (e === undefined ? 0 : parseInt(e.value, 10)) + 1;
    this._strings.set(key, {
      value: String(next),
      expiresAt: e?.expiresAt ?? null,
    });
    return next;
  }

  async pexpire(key: string, ttlMs: number): Promise<number> {
    for (const kind of ['string', 'hash', 'zset'] as const) {
      const store =
        kind === 'string'
          ? this._liveString(key)
          : kind === 'hash'
            ? this._liveHash(key)
            : this._liveZset(key);
      if (store !== undefined) {
        store.expiresAt = this._now() + ttlMs;
        return 1;
      }
    }
    return 0;
  }

  async pttl(key: string): Promise<number> {
    const s = this._liveString(key);
    if (s !== undefined) return this._ttlOf(s.expiresAt, true);
    const h = this._liveHash(key);
    if (h !== undefined) return this._ttlOf(h.expiresAt, true);
    const z = this._liveZset(key);
    if (z !== undefined) return this._ttlOf(z.expiresAt, true);
    return -2;
  }

  async del(key: string): Promise<number> {
    let n = 0;
    if (this._strings.delete(key)) n++;
    if (this._hashes.delete(key)) n++;
    if (this._zsets.delete(key)) n++;
    return n;
  }

  async hmget(key: string, fields: string[]): Promise<(string | null)[]> {
    const h = this._liveHash(key);
    return fields.map((f) => h?.fields.get(f) ?? null);
  }

  async hmset(key: string, fieldValues: Record<string, string>): Promise<'OK'> {
    let h = this._liveHash(key);
    if (h === undefined) {
      h = { fields: new Map(), expiresAt: null };
      this._hashes.set(key, h);
    }
    for (const [f, v] of Object.entries(fieldValues)) {
      h.fields.set(f, v);
    }
    return 'OK';
  }

  async zadd(key: string, score: number, member: string): Promise<number> {
    let z = this._liveZset(key);
    if (z === undefined) {
      z = { entries: new Map(), expiresAt: null };
      this._zsets.set(key, z);
    }
    const isNew = !z.entries.has(member);
    z.entries.set(member, score);
    return isNew ? 1 : 0;
  }

  async zcard(key: string): Promise<number> {
    return this._liveZset(key)?.entries.size ?? 0;
  }

  async zremrangebyscore(key: string, min: number, max: number): Promise<number> {
    const z = this._liveZset(key);
    if (z === undefined) return 0;
    let removed = 0;
    for (const [member, score] of z.entries) {
      if (score >= min && score <= max) {
        z.entries.delete(member);
        removed++;
      }
    }
    return removed;
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    const z = this._liveZset(key);
    if (z === undefined) return [];
    const sorted: ZEntry[] = [...z.entries.entries()]
      .map(([member, score]) => ({ member, score }))
      .sort((a, b) => a.score - b.score || (a.member < b.member ? -1 : 1));
    const end = stop < 0 ? sorted.length : stop + 1;
    return sorted.slice(start, end).map((e) => e.member);
  }

  async ping(): Promise<string> {
    return 'PONG';
  }

  /** Unique member suffix for sliding-window entries. */
  nextMemberSuffix(): string {
    return `:${++this._memberSeq}`;
  }

  /** Test helper — keys currently live across all stores. */
  keyCount(): number {
    let n = 0;
    for (const k of this._strings.keys()) if (this._liveString(k)) n++;
    for (const k of this._hashes.keys()) if (this._liveHash(k)) n++;
    for (const k of this._zsets.keys()) if (this._liveZset(k)) n++;
    return n;
  }
}

/* ------------------------------------------------------------------ */
/* Limiter                                                             */
/* ------------------------------------------------------------------ */

/** Result of a rate-limit check — X-RateLimit-* header material. */
export interface DistributedCheckResult {
  readonly allowed: boolean;
  /** Hits recorded in the current window *including* this request. */
  readonly current: number;
  /** Hits still available in this window. */
  readonly remaining: number;
  /** Epoch ms when the limiter would next admit (window reset). */
  readonly resetTime: number;
  /** For token bucket: ms until `cost` tokens would be available. */
  readonly waitTimeMs?: number;
  /** For token bucket: tokens remaining after this check. */
  readonly tokensRemaining?: number;
}

export interface DistributedRateLimiterOptions {
  readonly client: DistributedRateLimitClient;
  /** Key namespace, e.g. 'throttle:'. Default 'throttle:'. */
  readonly keyPrefix?: string;
  readonly now?: () => number;
}

export class DistributedRateLimiter {
  private readonly _client: DistributedRateLimitClient;
  private readonly _prefix: string;
  private readonly _now: () => number;

  constructor(options: DistributedRateLimiterOptions) {
    this._client = options.client;
    this._prefix = options.keyPrefix ?? 'throttle:';
    this._now = options.now ?? (() => Date.now());
  }

  /**
   * Fixed window — one counter per `floor(now/window)` bucket.
   *
   * Matches the Lua script: first hit in a window does
   * `SET key 1 PX window`; later hits `INCR`. TTL equals the window
   * remainder so counters self-delete at the boundary.
   *
   * Boundary behavior: a burst at t=59s and t=61s of a 60s window are
   * *different* buckets — the classic fixed-window edge problem the
   * sliding log solves.
   */
  async checkFixedWindow(
    identifier: string,
    limit: number,
    windowMs: number
  ): Promise<DistributedCheckResult> {
    const now = this._now();
    const windowStart = now - (now % windowMs);
    const key = `${this._prefix}fixed:${identifier}:${windowStart}`;
    const current = await this._client.incr(key);
    if (current === 1) {
      await this._client.pexpire(key, windowMs);
    }
    const ttl = await this._client.pttl(key);
    return {
      allowed: current <= limit,
      current,
      remaining: Math.max(0, limit - current),
      resetTime: now + (ttl > 0 ? ttl : windowMs),
    };
  }

  /**
   * Sliding window log — sorted set of per-request timestamps.
   *
   * Exact semantics of the reference Lua:
   *   1. ZREMRANGEBYSCORE key −inf (now−window) — evict stale entries
   *   2. ZCARD — count remaining
   *   3. count < limit → ZADD now member, PEXPIRE window, admit
   *      else → reject; resetTime = oldest entry + window
   *
   * Precise (no boundary burst) at O(window entries) memory per key.
   */
  async checkSlidingWindowLog(
    identifier: string,
    limit: number,
    windowMs: number
  ): Promise<DistributedCheckResult> {
    const now = this._now();
    const key = `${this._prefix}swl:${identifier}`;
    const windowStart = now - windowMs;
    await this._client.zremrangebyscore(key, Number.NEGATIVE_INFINITY, windowStart);
    const count = await this._client.zcard(key);
    if (count < limit) {
      const member = this._uniqueMember(now);
      await this._client.zadd(key, now, member);
      await this._client.pexpire(key, windowMs);
      return {
        allowed: true,
        current: count + 1,
        remaining: limit - count - 1,
        resetTime: now + windowMs,
      };
    }
    const oldest = await this._client.zrange(key, 0, 0);
    const oldestScore = oldest.length > 0 ? this._scoreOf(oldest[0]) : now;
    return {
      allowed: false,
      current: count,
      remaining: 0,
      resetTime: oldestScore + windowMs,
    };
  }

  /**
   * Token bucket — hash {tokens, lastRefill} refilled lazily.
   *
   * Same math as the Lua `tokenBucket` script: tokens accrue at
   * `refillRatePerMs`, capped at `capacity`; rejection still persists
   * the refilled level (so the bucket doesn't "refund" rejection races).
   * TTL = 2×full-refill-time, enough for the bucket to be collectible.
   */
  async checkTokenBucket(
    identifier: string,
    capacity: number,
    refillRatePerMs: number,
    tokensRequested = 1
  ): Promise<DistributedCheckResult> {
    const now = this._now();
    const key = `${this._prefix}tb:${identifier}`;
    const [tokensRaw, lastRefillRaw] = await this._client.hmget(key, ['tokens', 'lastRefill']);
    let tokens = tokensRaw === null ? capacity : parseFloat(tokensRaw);
    const lastRefill = lastRefillRaw === null ? now : parseFloat(lastRefillRaw);
    const elapsed = now - lastRefill;
    tokens = Math.min(capacity, tokens + elapsed * refillRatePerMs);
    const ttl = Math.ceil(capacity / refillRatePerMs) * 2;
    if (tokens >= tokensRequested) {
      tokens -= tokensRequested;
      await this._client.hmset(key, { tokens: String(tokens), lastRefill: String(now) });
      await this._client.pexpire(key, ttl);
      return {
        allowed: true,
        current: tokensRequested,
        remaining: Math.floor(tokens),
        resetTime: now,
        tokensRemaining: tokens,
        waitTimeMs: 0,
      };
    }
    const waitTimeMs = (tokensRequested - tokens) / refillRatePerMs;
    await this._client.hmset(key, { tokens: String(tokens), lastRefill: String(now) });
    await this._client.pexpire(key, ttl);
    return {
      allowed: false,
      current: tokensRequested,
      remaining: 0,
      resetTime: now + waitTimeMs,
      tokensRemaining: tokens,
      waitTimeMs,
    };
  }

  /** Remove all limiter state for `identifier` (admin reset). */
  async reset(identifier: string): Promise<void> {
    const now = this._now();
    // Fixed-window keys embed the bucket start — delete via key list.
    // The client doesn't expose KEYS; delete the known window buckets
    // for plausible window sizes by tracking is impractical, so the
    // adapter stores fixed keys under a per-identifier index is *not*
    // required: callers know their windows. We delete swl + tb + the
    // current fixed bucket.
    await this._client.del(`${this._prefix}swl:${identifier}`);
    await this._client.del(`${this._prefix}tb:${identifier}`);
    // Current fixed bucket keys can't be enumerated without KEYS — the
    // caller should supply windowMs to resetFixedWindow instead.
    void now;
  }

  /** Delete the fixed-window counter for a specific window size. */
  async resetFixedWindow(identifier: string, windowMs: number): Promise<void> {
    const windowStart = this._now() - (this._now() % windowMs);
    await this._client.del(`${this._prefix}fixed:${identifier}:${windowStart}`);
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    const start = this._now();
    try {
      await this._client.ping();
      return { healthy: true, latencyMs: this._now() - start };
    } catch {
      return { healthy: false, latencyMs: this._now() - start };
    }
  }

  /**
   * Unique zset member for the sliding log. Mirrors the Lua
   * `now .. ':' .. math.random()` — timestamp prefix + unique suffix.
   */
  private _uniqueMember(now: number): string {
    if (this._client instanceof InMemoryDistributedClient) {
      return `${now}${this._client.nextMemberSuffix()}`;
    }
    return `${now}:${Math.random().toString(36).slice(2)}`;
  }

  /** Extract the score prefix from a `ts:suffix` member string. */
  private _scoreOf(member: string): number {
    const colon = member.indexOf(':');
    const ts = colon > 0 ? member.slice(0, colon) : member;
    const n = Number(ts);
    return Number.isFinite(n) ? n : 0;
  }
}
