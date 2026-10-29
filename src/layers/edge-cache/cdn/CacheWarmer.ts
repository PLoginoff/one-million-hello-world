/**
 * CacheWarmer — proactive cache pre-heating.
 *
 * Given a manifest of URLs (+ optional headers/tags), fetches them
 * through an EdgeCacheEngine with bounded concurrency so a deploy or a
 * purge doesn't leave the cache cold. Tracks per-URL outcome so callers
 * can retry failures selectively.
 *
 * Concurrency: a simple worker-pool — N slots each pulling the next
 * URL off a shared index counter. Order is preserved for reporting.
 *
 * @module EdgeCache/Cdn
 */

import { EdgeCacheEngine } from './EdgeCacheEngine';
import { EdgeRequest, EdgeResponse, OriginFetcher, CacheDisposition } from './types';

export interface WarmItem {
  url: string;
  headers?: Record<string, string>;
  tags?: string[];
}

export interface WarmResult {
  url: string;
  ok: boolean;
  disposition?: CacheDisposition;
  status?: number;
  error?: string;
}

export interface WarmSummary {
  total: number;
  warmed: number;
  alreadyCached: number;
  failed: number;
  results: WarmResult[];
}

export class CacheWarmer {
  private readonly _engine: EdgeCacheEngine;
  private readonly _concurrency: number;

  constructor(engine: EdgeCacheEngine, concurrency = 4) {
    this._engine = engine;
    this._concurrency = Math.max(1, concurrency);
  }

  /**
   * Warm a list of URLs through the engine. Each item is fetched as a
   * GET; hits short-circuit (alreadyCached), misses store normally.
   */
  async warm(items: WarmItem[], origin: OriginFetcher): Promise<WarmSummary> {
    const results: WarmResult[] = new Array(items.length);
    let index = 0;

    const worker = async (): Promise<void> => {
      for (;;) {
        const i = index++;
        if (i >= items.length) return;
        const item = items[i];
        const req: EdgeRequest = { method: 'GET', url: item.url, headers: item.headers ?? {} };
        try {
          const r = await this._engine.fetch(req, origin, { tags: item.tags });
          results[i] = { url: item.url, ok: true, disposition: r.disposition, status: r.response.status };
        } catch (e) {
          results[i] = { url: item.url, ok: false, error: e instanceof Error ? e.message : String(e) };
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(this._concurrency, items.length) }, worker));

    const summary: WarmSummary = { total: items.length, warmed: 0, alreadyCached: 0, failed: 0, results };
    for (const r of results) {
      if (!r.ok) {
        summary.failed++;
      } else if (r.disposition === CacheDisposition.HIT || r.disposition === CacheDisposition.REVALIDATED) {
        summary.alreadyCached++;
      } else {
        summary.warmed++;
      }
    }
    return summary;
  }

  /** Warm only the items that failed in a previous summary. */
  async retryFailed(items: WarmItem[], previous: WarmSummary, origin: OriginFetcher): Promise<WarmSummary> {
    const failedUrls = new Set(previous.results.filter((r) => !r.ok).map((r) => r.url));
    return this.warm(items.filter((i) => failedUrls.has(i.url)), origin);
  }

  /** Response passthrough helper for tests. */
  static ok(body: string, headers: Record<string, string> = {}): EdgeResponse {
    return { status: 200, headers: { 'cache-control': 'max-age=300', ...headers }, body };
  }
}
