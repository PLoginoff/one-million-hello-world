/**
 * StaleIfError — serve stale content when the origin fails.
 *
 * The EdgeCacheEngine already understands `stale-if-error` freshness
 * windows (cdn/CacheControl.ts). This module is the standalone fallback
 * decision-maker for paths that fetch through the shield/origin directly:
 *
 *   try { resp = await origin() } catch { serve stale if within SIE }
 *   resp.status >= 500         → serve stale if within SIE
 *   resp.status 4xx            → NEVER serve stale (client errors aren't
 *                                origin failures — a 404 is meaningful)
 *
 * Config honors the response's own `stale-if-error` directive when
 * present, falling back to `defaultSieMs`.
 *
 * Decision object tells the caller WHY (for logs/metrics), and tracks
 * how often stale-if-error actually saved a response — the "resilience
 * dividend" of the cache.
 *
 * @module EdgeCache/Engine
 */

import { EdgeResponse } from '../cdn/types';
import { parseCacheControl } from '../cdn/CacheControl';
import { IClock, SystemClock } from '../../observability/engine/signals';

export type StaleDecision =
  | { serve: 'fresh' }
  | { serve: 'stale'; ageSeconds: number; reason: 'origin-error' | 'origin-5xx' }
  | { serve: 'error' };

export interface StaleEntry {
  readonly response: EdgeResponse;
  readonly storedAt: number;
  /** Explicit SIE window from the stored response's Cache-Control, if any. */
  readonly sieSeconds?: number;
}

export class StaleIfError {
  private readonly _clock: IClock;
  private readonly _defaultSieMs: number;
  private _servedStale = 0;
  private _errors = 0;

  constructor(opts: { defaultSieMs?: number } = {}, clock: IClock = new SystemClock()) {
    this._clock = clock;
    this._defaultSieMs = opts.defaultSieMs ?? 300_000; // 5min default
  }

  /** SIE window for an entry: response directive wins, else default. */
  sieWindowMs(entry: StaleEntry): number {
    const stored = entry.sieSeconds !== undefined
      ? entry.sieSeconds
      : parseCacheControl(entry.response.headers['cache-control']).staleIfError;
    return (stored ?? this._defaultSieMs / 1000) * 1000;
  }

  /**
   * Decide what to serve when the origin produced `resp` or threw.
   * `entry` is the stale cache entry (undefined = nothing to fall back to).
   */
  decide(entry: StaleEntry | undefined, resp: EdgeResponse | undefined, error?: unknown): StaleDecision {
    const originFailed = error !== undefined || (resp !== undefined && resp.status >= 500);
    if (!originFailed) return { serve: resp === undefined ? 'error' : 'fresh' };

    this._errors++;
    if (!entry) return { serve: 'error' };

    const now = this._clock.nowMs();
    const window = this.sieWindowMs(entry);
    const age = now - entry.storedAt;
    if (age > window) return { serve: 'error' };

    this._servedStale++;
    return {
      serve: 'stale',
      ageSeconds: Math.floor(age / 1000),
      reason: error !== undefined ? 'origin-error' : 'origin-5xx',
    };
  }

  /**
   * Full fetch flow: try origin; on failure or 5xx, serve the stale entry
   * inside its SIE window; otherwise propagate the failure.
   */
  async fetchWithFallback(
    entry: StaleEntry | undefined,
    origin: () => Promise<EdgeResponse>
  ): Promise<{ response: EdgeResponse; disposition: 'fresh' | 'stale' } | { error: unknown }> {
    let resp: EdgeResponse | undefined;
    let err: unknown;
    try {
      resp = await origin();
    } catch (e) {
      err = e;
    }
    const d = this.decide(entry, resp, err);
    if (d.serve === 'fresh') return { response: resp!, disposition: 'fresh' };
    if (d.serve === 'stale') {
      return {
        response: {
          ...entry!.response,
          headers: { ...entry!.response.headers, 'x-stale-if-error': 'true', age: String(d.ageSeconds) },
        },
        disposition: 'stale',
      };
    }
    if (resp) return { response: resp, disposition: 'fresh' }; // 5xx, no usable stale → pass it through
    return { error: err };
  }

  /** "Resilience dividend": stale serves / origin failures. */
  stats(): { errors: number; servedStale: number; saveRate: number } {
    return {
      errors: this._errors,
      servedStale: this._servedStale,
      saveRate: this._errors === 0 ? 0 : this._servedStale / this._errors,
    };
  }
}
