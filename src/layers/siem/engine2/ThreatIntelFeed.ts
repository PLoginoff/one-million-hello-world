/**
 * Threat Intel Feed — IP/domain/hash/url blocklists with expiry.
 *
 * Indicators are stored per-type in Maps for O(1) lookup; an optional
 * per-indicator `expiresAtMs` makes the feed self-cleaning — lookups
 * treat expired indicators as absent and `sweep()` reclaims them.
 * Feed provenance is preserved so matches can be audited back to the
 * source feed and confidence.
 *
 * Matching rules per field:
 *   sourceIp / destIp  → 'ip' indicators, exact match
 *   fields.domain / hostname-ish fields → 'domain' indicators,
 *     with suffix match (indicator "evil.com" matches "a.evil.com")
 *
 * @module SiemLayer/Engine2
 */

import { NormalizedEvent } from '../engine/EventNormalizer';
import { IClock, SystemClock } from '../../observability/engine/signals';
import { FeedStats, Indicator, IndicatorMatch, IndicatorType } from './types';

interface StoredIndicator extends Indicator {
  readonly storedAtMs: number;
}

const DOMAIN_FIELDS = ['domain', 'hostname', 'fqdn', 'host', 'query'];

export class ThreatIntelFeed {
  private readonly _clock: IClock;
  /** type → (value → indicator). Values stored lowercased. */
  private readonly _byType = new Map<IndicatorType, Map<string, StoredIndicator>>();
  private readonly _feeds = new Map<string, { count: number; lastRefreshMs?: number }>();

  constructor(clock: IClock = new SystemClock()) {
    this._clock = clock;
  }

  /**
   * Ingest a batch of indicators from one feed. Re-ingesting the same
   * value refreshes it (latest write wins — the feed is authoritative).
   */
  ingest(feed: string, indicators: ReadonlyArray<Indicator>): number {
    let added = 0;
    for (const ind of indicators) {
      const value = ind.value.toLowerCase();
      let bucket = this._byType.get(ind.type);
      if (!bucket) {
        bucket = new Map();
        this._byType.set(ind.type, bucket);
      }
      const existing = bucket.get(value);
      bucket.set(value, { ...ind, value, feed, storedAtMs: this._clock.nowMs() });
      if (!existing) added += 1;
    }
    const f = this._feeds.get(feed) ?? { count: 0 };
    f.count += added;
    f.lastRefreshMs = this._clock.nowMs();
    this._feeds.set(feed, f);
    return added;
  }

  /** Exact lookup of a single indicator value. */
  lookup(type: IndicatorType, value: string): Indicator | undefined {
    const ind = this._byType.get(type)?.get(value.toLowerCase());
    if (!ind) return undefined;
    if (this._expired(ind)) return undefined;
    return ind;
  }

  /**
   * Scan a normalized event for indicator hits. Returns all matches —
   * an event can hit on sourceIp AND destIp simultaneously.
   */
  scan(e: NormalizedEvent): IndicatorMatch[] {
    const out: IndicatorMatch[] = [];
    const check = (type: IndicatorType, value: string | undefined, field: string): void => {
      if (!value) return;
      const ind = this.lookup(type, value);
      if (ind) {
        out.push({ type, value: ind.value, feed: ind.feed, confidence: ind.confidence, field });
      }
    };
    check('ip', e.sourceIp, 'sourceIp');
    check('ip', e.destIp, 'destIp');
    for (const f of DOMAIN_FIELDS) {
      const v = e.fields[f];
      if (!v) continue;
      const ind = this._domainLookup(v);
      if (ind) {
        out.push({ type: 'domain', value: ind.value, feed: ind.feed, confidence: ind.confidence, field: f });
      }
    }
    const hash = e.fields['hash'] ?? e.fields['file_hash'] ?? e.fields['md5'] ?? e.fields['sha256'];
    check('hash', hash, 'hash');
    const url = e.fields['url'];
    check('url', url, 'url');
    return out;
  }

  /** Drop all indicators belonging to a feed (feed retired). */
  evictFeed(feed: string): number {
    let removed = 0;
    for (const bucket of this._byType.values()) {
      for (const [k, ind] of bucket) {
        if (ind.feed === feed) {
          bucket.delete(k);
          removed += 1;
        }
      }
    }
    this._feeds.delete(feed);
    return removed;
  }

  /** Remove expired indicators; returns how many were reaped. */
  sweep(): number {
    let removed = 0;
    for (const bucket of this._byType.values()) {
      for (const [k, ind] of bucket) {
        if (this._expired(ind)) {
          bucket.delete(k);
          removed += 1;
        }
      }
    }
    return removed;
  }

  stats(): FeedStats[] {
    const out: FeedStats[] = [];
    for (const [feed, meta] of this._feeds) {
      let live = 0;
      let expired = 0;
      for (const bucket of this._byType.values()) {
        for (const ind of bucket.values()) {
          if (ind.feed !== feed) continue;
          if (this._expired(ind)) expired += 1;
          else live += 1;
        }
      }
      out.push({ feed, indicators: live, expiredPendingSweep: expired, lastRefreshMs: meta.lastRefreshMs });
    }
    return out;
  }

  private _domainLookup(host: string): StoredIndicator | undefined {
    const bucket = this._byType.get('domain');
    if (!bucket) return undefined;
    let h = host.toLowerCase();
    // Walk the suffix chain: a.b.c → b.c → c. Subdomain indicators match.
    while (h.includes('.')) {
      const ind = bucket.get(h);
      if (ind && !this._expired(ind)) return ind;
      h = h.slice(h.indexOf('.') + 1);
    }
    const last = bucket.get(h);
    return last && !this._expired(last) ? last : undefined;
  }

  private _expired(ind: StoredIndicator): boolean {
    return ind.expiresAtMs !== undefined && this._clock.nowMs() >= ind.expiresAtMs;
  }
}
