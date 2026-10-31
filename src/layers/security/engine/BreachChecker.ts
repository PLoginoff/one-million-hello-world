/**
 * BreachChecker — k-anonymity password breach lookup.
 *
 * The problem: "is this password in a breach corpus?" can't be asked
 * by sending the password (or even its hash) to a third party — that
 * leaks the very thing being checked. The k-anonymity scheme (Cloudflare's
 * Pwned Passwords protocol) splits the hash:
 *
 *   sha1(password) = 40 hex chars = PREFIX(5) + SUFFIX(35)
 *
 *   client → sends only PREFIX (5 chars → ~2^20 buckets)
 *   service → returns every suffix in that bucket (hundreds)
 *   client → membership-checks SUFFIX locally
 *
 * The service learns only "this client is checking *some* hash in
 * bucket X" — every other hash in the bucket provides anonymity set
 * cover (hence "k"-anonymity: the querier is indistinguishable among
 * k≈bucket-size candidates). The full hash never leaves the caller.
 *
 * `BreachCorpus` is the service side: the breach dataset itself, stored
 * prefix→suffixes. In production this is HaveIBeenPwned's API; here
 * it's an injectable store so tests run offline — the *protocol* is
 * what's being modeled, and it's the same either way.
 *
 * `BreachChecker` is the client: hashes the candidate, sends only the
 * prefix, checks the returned suffixes locally, and reports a verdict
 * with the observed anonymity-set size (bigger bucket = better cover).
 *
 * Complexity: corpus lookup O(1) avg (hash map by prefix); client
 * membership check O(bucket size) ≈ a few hundred string compares.
 *
 * @module SecurityLayer/Engine
 */

import { createHash } from 'node:crypto';
import { SecurityClock, SystemSecurityClock } from './types';

/* ------------------------------------------------------------------ */
/* Corpus (service side)                                               */
/* ------------------------------------------------------------------ */

/**
 * The breach dataset, keyed by 5-hex-char SHA-1 prefix → suffix map
 * (suffix → breach count). The reference impl is in-memory; the
 * interface exists so a file/HTTP-backed corpus slots in unchanged.
 */
export interface BreachCorpus {
  /**
   * All suffixes (and counts) under `prefix` — exactly what the real
   * API's `range` endpoint returns. Prefix must be 5 hex chars.
   */
  range(prefix: string): ReadonlyMap<string, number> | null;
  /** Distinct prefixes — useful for anonymity-set stats. */
  readonly prefixCount: number;
}

export class InMemoryBreachCorpus implements BreachCorpus {
  private readonly _buckets = new Map<string, Map<string, number>>();

  /** Load `{ sha1hex: count }` entries (any case; normalized to upper). */
  load(entries: Readonly<Record<string, number>> | Iterable<[string, number]>): number {
    let n = 0;
    const it = Array.isArray(entries) ? entries : entries instanceof Map
      ? entries.entries()
      : Object.entries(entries);
    for (const [hash, count] of it as Iterable<[string, number]>) {
      const h = hash.toUpperCase();
      if (h.length !== 40) continue;
      const prefix = h.slice(0, 5);
      const suffix = h.slice(5);
      let bucket = this._buckets.get(prefix);
      if (!bucket) {
        bucket = new Map();
        this._buckets.set(prefix, bucket);
      }
      bucket.set(suffix, (bucket.get(suffix) ?? 0) + Math.max(1, count));
      n++;
    }
    return n;
  }

  /** Load plaintext passwords (hashed on insert — a test convenience). */
  loadPlaintext(passwords: Iterable<string>, count = 1): number {
    const entries: Array<[string, number]> = [];
    for (const p of passwords) {
      entries.push([sha1Hex(p), count]);
    }
    return this.load(entries);
  }

  range(prefix: string): ReadonlyMap<string, number> | null {
    return this._buckets.get(prefix.toUpperCase()) ?? null;
  }

  get prefixCount(): number {
    return this._buckets.size;
  }

  /** Bucket size — the k in k-anonymity for a given prefix. */
  bucketSize(prefix: string): number {
    return this._buckets.get(prefix.toUpperCase())?.size ?? 0;
  }
}

/** SHA-1 hex uppercase — the protocol's hash (breach corpora standardize on SHA-1). */
export function sha1Hex(input: string): string {
  return createHash('sha1').update(input, 'utf8').digest('hex').toUpperCase();
}

/* ------------------------------------------------------------------ */
/* Client                                                              */
/* ------------------------------------------------------------------ */

export interface BreachCheckOptions {
  /**
   * Corpus or an async range function (the real deployment would call
   * `https://api.pwnedpasswords.com/range/{prefix}`).
   */
  readonly corpus: BreachCorpus | ((prefix: string) => ReadonlyMap<string, number> | null);
  /**
   * Warn when the anonymity set is smaller than this — a tiny bucket
   * means the prefix itself nearly identifies the password.
   * Default 100 (real HIBP buckets average ~500-800).
   */
  readonly minAnonymitySet?: number;
  /** Extra random padding suffixes mixed into responses to widen
   *  anonymity sets (the real API does this). Default 0 = off. */
  readonly paddingPerBucket?: number;
  readonly clock?: SecurityClock;
}

export interface BreachVerdict {
  /** Found in the breach corpus. */
  readonly breached: boolean;
  /** Times this password appears across breaches (corpus count). */
  readonly occurrences: number;
  /**
   * Size of the anonymity set the prefix resolved to — how many
   * candidate hashes the corpus couldn't distinguish the query among.
   */
  readonly anonymitySetSize: number;
  /** True when anonymitySetSize < minAnonymitySet — weak cover. */
  readonly weakAnonymity: boolean;
  readonly checkedAt: number;
}

export class BreachChecker {
  private readonly _corpus: BreachCorpus | ((p: string) => ReadonlyMap<string, number> | null);
  private readonly _minAnonymity: number;
  private readonly _padding: number;
  private readonly _clock: SecurityClock;
  private _queries = 0;

  constructor(opts: BreachCheckOptions) {
    this._corpus = opts.corpus;
    this._minAnonymity = opts.minAnonymitySet ?? 100;
    this._padding = Math.max(0, opts.paddingPerBucket ?? 0);
    this._clock = opts.clock ?? new SystemSecurityClock();
  }

  /**
   * Check `password` against the corpus. The password and its full
   * hash never leave this call — only the 5-char prefix goes out.
   */
  check(password: string): BreachVerdict {
    const hash = sha1Hex(password);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    this._queries++;

    const raw = typeof this._corpus === 'function'
      ? this._corpus(prefix)
      : this._corpus.range(prefix);

    // Optional padding: merge decoy suffixes so the response bucket is
    // wider than the real corpus's (mirrors HIBP's padding option).
    const bucket = new Map<string, number>(raw ?? []);
    for (let i = 0; i < this._padding; i++) {
      const decoy = createHash('sha1').update(`pad:${prefix}:${i}`).digest('hex').toUpperCase().slice(5);
      if (!bucket.has(decoy)) bucket.set(decoy, 0);
    }

    const occurrences = bucket.get(suffix) ?? 0;
    const set = bucket.size;
    return {
      breached: occurrences > 0,
      occurrences,
      anonymitySetSize: set,
      weakAnonymity: set < this._minAnonymity,
      checkedAt: this._clock.now(),
    };
  }

  /**
   * Policy helper: a password is acceptable when not breached OR
   * breached below `maxOccurrences` (a password seen 3× in ancient
   * breaches is different from one seen 4M times — it's probably in
   * every dictionary).
   */
  acceptable(password: string, maxOccurrences = 0): boolean {
    const v = this.check(password);
    return !v.breached || v.occurrences <= maxOccurrences;
  }

  get queries(): number {
    return this._queries;
  }
}

/**
 * A simulated remote corpus behind a small artificial delay — models
 * the network hop so callers write async-correct code. The delay is
 * clock-virtual: it records latency stats without real sleeps.
 */
export class RemoteCorpusStub implements BreachCorpus {
  private readonly _inner: BreachCorpus;
  private readonly _latencyMs: number;
  private _clock: SecurityClock;
  private _latencyTotal = 0;
  private _calls = 0;

  constructor(inner: BreachCorpus, latencyMs = 20, clock: SecurityClock = new SystemSecurityClock()) {
    this._inner = inner;
    this._latencyMs = latencyMs;
    this._clock = clock;
  }

  range(prefix: string): ReadonlyMap<string, number> | null {
    this._calls++;
    this._latencyTotal += this._latencyMs;
    this._clock.now(); // touch the clock — keeps the injection honest
    return this._inner.range(prefix);
  }

  get prefixCount(): number {
    return this._inner.prefixCount;
  }

  /** Simulated round-trip stats for tests. */
  get stats(): { calls: number; totalLatencyMs: number; avgLatencyMs: number } {
    return {
      calls: this._calls,
      totalLatencyMs: this._latencyTotal,
      avgLatencyMs: this._calls === 0 ? 0 : this._latencyTotal / this._calls,
    };
  }
}
