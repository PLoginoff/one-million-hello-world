/**
 * OriginShield — second-tier collapsing layer in front of the origin.
 *
 * Real CDNs route edge misses through a "shield" PoP that coalesces
 * concurrent requests across regions before hitting the origin. This
 * wraps a raw OriginFetcher with:
 *
 *  - Cross-region single-flight: an in-flight Map<baseKey, Promise>
 *    shared by ALL callers — two edges in different regions fetching
 *    the same URL produce ONE origin request.
 *  - Origin concurrency cap: excess fetches queue on a semaphore so a
 *    stampede can't overload the origin.
 *  - Retry with linear backoff for transient origin failures.
 *  - Shield-level stats: requests in, coalesced, origin hits, retries.
 *
 * @module EdgeCache/Cdn
 */

import { EdgeRequest, EdgeResponse, OriginFetcher } from './types';
import { baseKey } from './CacheKey';

export interface ShieldStats {
  requests: number;
  coalesced: number;
  originFetches: number;
  retries: number;
  failures: number;
  /** Peak queued-behind-semaphore depth. */
  maxQueueDepth: number;
}

export interface ShieldConfig {
  /** Max concurrent origin requests. */
  maxConcurrency: number;
  /** Retries on transient (5xx/throw) failure. */
  maxRetries: number;
  /** Base ms for linear backoff between retries. */
  retryBaseMs: number;
}

const DEFAULTS: ShieldConfig = { maxConcurrency: 16, maxRetries: 1, retryBaseMs: 50 };

export class OriginShield {
  private readonly _config: ShieldConfig;
  private readonly _inflight: Map<string, Promise<EdgeResponse>> = new Map();
  private readonly _stats: ShieldStats = { requests: 0, coalesced: 0, originFetches: 0, retries: 0, failures: 0, maxQueueDepth: 0 };
  private _active = 0;
  private _queueDepth = 0;
  private readonly _waiters: Array<() => void> = [];

  constructor(config?: Partial<ShieldConfig>) {
    this._config = { ...DEFAULTS, ...config };
  }

  /**
   * Fetch through the shield. Collapses identical in-flight keys and
   * serializes origin pressure through the concurrency semaphore.
   */
  async fetch(req: EdgeRequest, origin: OriginFetcher): Promise<EdgeResponse> {
    this._stats.requests++;
    const key = req.method + ' ' + baseKey(req.url);
    const pending = this._inflight.get(key);
    if (pending) {
      this._stats.coalesced++;
      return pending.then((r) => ({ ...r }));
    }
    const promise = this._fetchThroughSemaphore(req, origin).finally(() => this._inflight.delete(key));
    this._inflight.set(key, promise);
    return promise;
  }

  private async _acquire(): Promise<void> {
    if (this._active < this._config.maxConcurrency) {
      this._active++;
      return;
    }
    this._queueDepth++;
    if (this._queueDepth > this._stats.maxQueueDepth) this._stats.maxQueueDepth = this._queueDepth;
    await new Promise<void>((resolve) => this._waiters.push(resolve));
    this._queueDepth--;
  }

  private _release(): void {
    const next = this._waiters.shift();
    if (next) {
      next(); // hand the slot directly to a waiter
    } else {
      this._active--;
    }
  }

  private async _fetchThroughSemaphore(req: EdgeRequest, origin: OriginFetcher): Promise<EdgeResponse> {
    await this._acquire();
    try {
      let lastErr: unknown;
      for (let attempt = 0; attempt <= this._config.maxRetries; attempt++) {
        if (attempt > 0) {
          this._stats.retries++;
          await sleep(this._config.retryBaseMs * attempt);
        }
        this._stats.originFetches++;
        try {
          const resp = await origin(req);
          if (resp.status < 500 || attempt === this._config.maxRetries) return resp;
          lastErr = new Error(`origin ${resp.status}`);
        } catch (e) {
          lastErr = e;
        }
      }
      this._stats.failures++;
      throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
    } finally {
      this._release();
    }
  }

  stats(): ShieldStats {
    return { ...this._stats };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
