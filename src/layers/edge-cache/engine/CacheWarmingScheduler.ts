/**
 * CacheWarmingScheduler — predictive warming driven by access stats.
 *
 * `CacheWarmer` (cdn/) warms an explicit manifest. This scheduler decides
 * the manifest itself from `PopularityStats` and runs the preload through
 * any caller-supplied fetcher (usually EdgeCacheEngine.fetch or the
 * ShieldHierarchy) with a bounded-concurrency worker pool.
 *
 *   const plan = scheduler.planWarming(50, freshUntil);  // top-50 cold keys
 *   const summary = await scheduler.executeWarming(plan, fetcher);
 *
 * Guardrails:
 *   - `minScore`: keys below it aren't worth warming (cold AND unpopular).
 *   - `maxConcurrent`: worker-pool cap (same pattern as CacheWarmer).
 *   - `cooldownMs`: a key isn't re-warmed inside the cooldown — repeated
 *     plans don't hammer the origin.
 *   - Stats-driven filtering happens in PopularityStats.warmCandidates.
 *
 * @module EdgeCache/Engine
 */

import { PopularityStats, KeyStats } from './PopularityStats';
import { EdgeRequest, EdgeResponse } from '../cdn/types';
import { IClock, SystemClock } from '../../observability/engine/signals';

export interface WarmPlan {
  readonly keys: KeyStats[];
  readonly generatedAt: number;
}

export interface WarmItemResult {
  readonly key: string;
  readonly ok: boolean;
  readonly status?: number;
  readonly error?: string;
}

export interface WarmingSummary {
  readonly planned: number;
  readonly executed: number;
  succeeded: number;
  failed: number;
  readonly results: WarmItemResult[];
  readonly elapsedMs: number;
}

export interface WarmingConfig {
  readonly minScore?: number;
  readonly maxConcurrent?: number;
  readonly cooldownMs?: number;
}

export class CacheWarmingScheduler {
  private readonly _stats: PopularityStats;
  private readonly _clock: IClock;
  private readonly _minScore: number;
  private readonly _maxConcurrent: number;
  private readonly _cooldownMs: number;
  private readonly _lastWarmed = new Map<string, number>();

  constructor(stats: PopularityStats, config: WarmingConfig = {}, clock: IClock = new SystemClock()) {
    this._stats = stats;
    this._clock = clock;
    this._minScore = config.minScore ?? 0;
    this._maxConcurrent = Math.max(1, config.maxConcurrent ?? 4);
    this._cooldownMs = config.cooldownMs ?? 300_000;
  }

  /**
   * Pick keys worth warming: top-N popular, likely-cold soon, over the
   * score floor, and not warmed inside the cooldown window.
   */
  planWarming(n: number, freshUntil: (key: string) => number | undefined): WarmPlan {
    const now = this._clock.nowMs();
    const keys = this._stats
      .warmCandidates(this._stats.trackedCount(), freshUntil)
      .filter((k) => {
        if (k.score < this._minScore) return false;
        const last = this._lastWarmed.get(k.key);
        return last === undefined || now - last > this._cooldownMs;
      })
      .slice(0, n);
    return { keys, generatedAt: now };
  }

  /**
   * Preload the plan's keys through `fetcher` (key → request → response).
   * Concurrency is a shared-index worker pool.
   */
  async executeWarming(
    plan: WarmPlan,
    fetcher: (req: EdgeRequest) => Promise<EdgeResponse>
  ): Promise<WarmingSummary> {
    const started = this._clock.nowMs();
    const results: WarmItemResult[] = new Array(plan.keys.length);
    let index = 0;

    const worker = async (): Promise<void> => {
      for (;;) {
        const i = index++;
        if (i >= plan.keys.length) return;
        const key = plan.keys[i].key;
        try {
          const resp = await fetcher({ method: 'GET', url: key, headers: {} });
          results[i] = { key, ok: resp.status < 500, status: resp.status };
          if (resp.status < 500) this._lastWarmed.set(key, this._clock.nowMs());
        } catch (e) {
          results[i] = { key, ok: false, error: e instanceof Error ? e.message : String(e) };
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(this._maxConcurrent, plan.keys.length) }, worker)
    );

    const summary: WarmingSummary = {
      planned: plan.keys.length,
      executed: results.filter((r) => r !== undefined).length,
      succeeded: 0,
      failed: 0,
      results,
      elapsedMs: this._clock.nowMs() - started,
    };
    for (const r of results) {
      if (r.ok) summary.succeeded++;
      else summary.failed++;
    }
    return summary;
  }

  /** Convenience: plan + execute in one call. */
  async warm(
    n: number,
    freshUntil: (key: string) => number | undefined,
    fetcher: (req: EdgeRequest) => Promise<EdgeResponse>
  ): Promise<WarmingSummary> {
    return this.executeWarming(this.planWarming(n, freshUntil), fetcher);
  }

  /** Keys excluded by cooldown right now (diagnostics). */
  inCooldown(key: string): boolean {
    const last = this._lastWarmed.get(key);
    return last !== undefined && this._clock.nowMs() - last <= this._cooldownMs;
  }
}
