/**
 * PopularityStats — access-statistics recorder + predictive warm list.
 *
 * `CacheWarmer` (cdn/) warms a caller-supplied URL manifest. This is the
 * missing upstream piece: WHICH urls deserve warming. It records hits per
 * key, ranks them by a score that balances frequency and recency, and
 * produces a warm list filtered to keys likely to MISS (cold or expiring
 * soon — a key already fresh doesn't need warming).
 *
 * Score model — EWMA of accesses per minute plus a recency bonus:
 *
 *   score = rate × (1 + recencyBonus(lastAccess))
 *
 * where `rate` is an exponentially-weighted access rate. Pure frequency
 * ranks stale-but-once-hot keys above rising ones; pure recency ranks
 * one-hit wonders above steady performers. EWMA + recency bonus is the
 * standard compromise (same idea as ARC/WTinyLFU admission).
 *
 * Cost: O(1) per record; O(K log K) for topK over K tracked keys.
 * Bounded memory: beyond `maxTracked`, the lowest-scoring keys are
 * evicted on periodic `compact()`.
 *
 * @module EdgeCache/Engine
 */

import { IClock, SystemClock } from '../../observability/engine/signals';

export interface KeyStats {
  readonly key: string;
  /** EWMA of accesses/minute. */
  readonly ratePerMin: number;
  /** Final score (rate × recency bonus). */
  readonly score: number;
  readonly accesses: number;
  readonly lastAccessMs: number;
}

interface KeyAgg {
  accesses: number;
  /** EWMA state: accesses per minute, halving every half-life. */
  rate: number;
  lastAccessMs: number;
  lastDecayMs: number;
}

export interface PopularityConfig {
  /** EWMA half-life in ms — older accesses count half as much. Default 10min. */
  readonly halfLifeMs?: number;
  /** Recency bonus cap: accessed just now → score × (1+cap). Default 1. */
  readonly recencyBonusCap?: number;
  /** Recency bonus decay horizon: bonus fades to 0 over this. Default 5min. */
  readonly recencyHorizonMs?: number;
  /** Hard cap on tracked keys before compact() trims. Default 50k. */
  readonly maxTracked?: number;
}

export class PopularityStats {
  private readonly _clock: IClock;
  private readonly _halfLife: number;
  private readonly _bonusCap: number;
  private readonly _bonusHorizon: number;
  private readonly _maxTracked: number;
  private readonly _keys = new Map<string, KeyAgg>();

  constructor(config: PopularityConfig = {}, clock: IClock = new SystemClock()) {
    this._clock = clock;
    this._halfLife = config.halfLifeMs ?? 600_000;
    this._bonusCap = config.recencyBonusCap ?? 1.0;
    this._bonusHorizon = config.recencyHorizonMs ?? 300_000;
    this._maxTracked = config.maxTracked ?? 50_000;
  }

  /** Record one access for `key`. O(1). */
  recordAccess(key: string, atMs?: number): void {
    const now = atMs ?? this._clock.nowMs();
    let k = this._keys.get(key);
    if (!k) {
      k = { accesses: 0, rate: 0, lastAccessMs: now, lastDecayMs: now };
      this._keys.set(key, k);
    }
    // Decay the EWMA to 'now', then add this access.
    const dt = now - k.lastDecayMs;
    if (dt > 0) {
      k.rate *= Math.pow(0.5, dt / this._halfLife);
      k.lastDecayMs = now;
    }
    k.accesses++;
    k.rate += 60_000 / this._halfLife; // one access, expressed per-minute-equivalent
    k.lastAccessMs = now;

    if (this._keys.size > this._maxTracked) this.compact();
  }

  /** Decayed rate for `key` right now (accesses/min). */
  rateOf(key: string): number {
    const k = this._keys.get(key);
    if (!k) return 0;
    const now = this._clock.nowMs();
    return k.rate * Math.pow(0.5, (now - k.lastDecayMs) / this._halfLife);
  }

  /** Score = rate × (1 + recencyBonus). */
  scoreOf(key: string): number {
    const k = this._keys.get(key);
    if (!k) return 0;
    const now = this._clock.nowMs();
    const age = now - k.lastAccessMs;
    const bonus = Math.max(0, 1 - age / this._bonusHorizon) * this._bonusCap;
    return this.rateOf(key) * (1 + bonus);
  }

  /** Top-N keys by current score. */
  topKeys(n: number): KeyStats[] {
    const scored: KeyStats[] = [];
    for (const [key, k] of this._keys) {
      scored.push({
        key,
        ratePerMin: this.rateOf(key),
        score: this.scoreOf(key),
        accesses: k.accesses,
        lastAccessMs: k.lastAccessMs,
      });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, n);
  }

  /**
   * Predictive warm list: top-N keys likely to be cold soon.
   * `freshUntil` lookup lets the caller filter out keys still fresh —
   * pass a fn returning the entry's expiry timestamp or undefined
   * (unknown → treat as warmable).
   */
  warmCandidates(
    n: number,
    freshUntil: (key: string) => number | undefined,
    opts: { horizonMs?: number } = {}
  ): KeyStats[] {
    const now = this._clock.nowMs();
    const horizon = opts.horizonMs ?? 60_000;
    return this.topKeys(this._keys.size)
      .filter((s) => {
        const exp = freshUntil(s.key);
        // Unknown expiry or expiring within horizon → worth warming.
        return exp === undefined || exp <= now + horizon;
      })
      .slice(0, n);
  }

  /** Evict the bottom-quartile keys (called on overflow). */
  compact(): void {
    const keep = Math.floor(this._maxTracked * 0.75);
    const ranked = this.topKeys(this._keys.size);
    this._keys.clear();
    const now = this._clock.nowMs();
    for (const s of ranked.slice(0, keep)) {
      this._keys.set(s.key, {
        accesses: s.accesses,
        rate: this.rateOf(s.key), // store decayed value
        lastAccessMs: s.lastAccessMs,
        lastDecayMs: now,
      });
    }
  }

  trackedCount(): number {
    return this._keys.size;
  }
}
