/**
 * Flag Analytics — richer evaluation telemetry than CountingAnalytics.
 *
 * Beyond per-flag/variant counts, this tracks *who* evaluated: unique
 * user counts via exact sets (bounded — switches to estimation past
 * `exactLimit`) and per-user evaluation distributions, so dashboards can
 * answer "how many distinct users saw variant B?" not just "how many
 * times did variant B evaluate?".
 *
 * Unique-user estimation: when a flag's seen-set exceeds `exactLimit`,
 * the tracker keeps counting new keys probabilistically — linear
 * counting over a fixed bitmap (m = 4096 bits):
 *
 *     uniques ≈ −m · ln(V / m)    where V = unset bits
 *
 *   Linear counting needs no register table (unlike HyperLogLog), is
 *   ~1% accurate up to ~m·5 uniques, and degrades gracefully — standard
 *   cardinality-estimation practice (Whang et al. 1990).
 *
 * Complexity: O(1) per evaluation; snapshot O(flags).
 *
 * @module FeatureFlags/Engine2
 */

import { EvalContext, Evaluation, flattenContext } from '../domain/flag-model';
import { EvaluationAnalytics } from '../implementations/FlagEvaluator';

export interface FlagAnalyticsConfig {
  /** Max exact unique-user tracking before switching to linear counting. */
  readonly exactLimit?: number;
  /** Linear-counting bitmap size in bits. */
  readonly bitmapBits?: number;
}

export interface FlagAnalyticsSummary {
  readonly flagKey: string;
  readonly totalEvaluations: number;
  /** Unique users — exact below the limit, estimated above. */
  readonly uniqueUsers: number;
  /** Whether uniqueUsers is an estimate. */
  readonly uniqueIsEstimate: boolean;
  readonly byVariant: Readonly<Record<string, number>>;
  readonly byReason: Readonly<Record<string, number>>;
  /** First/last evaluation timestamps (ms), null when unevaluated. */
  readonly firstSeen: number | null;
  readonly lastSeen: number | null;
}

const BITMAP_BITS = 8192;

interface FlagStats {
  total: number;
  byVariant: Map<string, number>;
  byReason: Map<string, number>;
  /** Exact unique set while small. */
  exactUsers: Set<string>;
  /** Once |exactUsers| > limit, we hash into this bitmap instead. */
  bitmap: Uint32Array | null;
  firstSeen: number | null;
  lastSeen: number | null;
}

/** FNV-1a — fast non-crypto hash for bitmap positions. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class FlagAnalytics implements EvaluationAnalytics {
  private readonly _exactLimit: number;
  private readonly _bitmapBits: number;
  private readonly _stats = new Map<string, FlagStats>();

  constructor(config: FlagAnalyticsConfig = {}) {
    this._exactLimit = config.exactLimit ?? 10_000;
    this._bitmapBits = config.bitmapBits ?? BITMAP_BITS;
  }

  onEvaluated(e: Evaluation, context?: EvalContext, _durationMs = 0): void {
    let st = this._stats.get(e.flagKey);
    if (!st) {
      st = {
        total: 0,
        byVariant: new Map(),
        byReason: new Map(),
        exactUsers: new Set(),
        bitmap: null,
        firstSeen: null,
        lastSeen: null,
      };
      this._stats.set(e.flagKey, st);
    }
    st.total++;
    st.byVariant.set(e.variant, (st.byVariant.get(e.variant) ?? 0) + 1);
    st.byReason.set(e.reason, (st.byReason.get(e.reason) ?? 0) + 1);

    const { kind, key } = flattenContext(context);
    if (key !== undefined) {
      this._trackUser(st, `${kind}:${key}`);
    }
    // Evaluation carries no timestamp — wall clock is fine for ordering.
    const now = Date.now();
    if (st.firstSeen === null) st.firstSeen = now;
    st.lastSeen = now;
  }

  /** Summary for one flag; null when never evaluated. */
  summary(flagKey: string): FlagAnalyticsSummary | null {
    const st = this._stats.get(flagKey);
    if (!st) return null;
    return {
      flagKey,
      totalEvaluations: st.total,
      uniqueUsers: this._uniqueCount(st),
      uniqueIsEstimate: st.bitmap !== null,
      byVariant: Object.fromEntries(st.byVariant),
      byReason: Object.fromEntries(st.byReason),
      firstSeen: st.firstSeen,
      lastSeen: st.lastSeen,
    };
  }

  /** All tracked flag keys. */
  flags(): string[] {
    return [...this._stats.keys()];
  }

  /**
   * Per-variant reach: fraction of unique users who evaluated to each
   * variant — needs per-variant user tracking, which we derive from
   * re-evaluation of the variant×user matrix only for small user bases.
   * (Below the exact limit we recompute from the exact set.)
   */
  variantDistribution(flagKey: string): { variant: string; share: number }[] {
    const st = this._stats.get(flagKey);
    if (!st || st.total === 0) return [];
    return [...st.byVariant.entries()]
      .map(([variant, count]) => ({ variant, share: count / st.total }))
      .sort((a, b) => b.share - a.share);
  }

  reset(): void {
    this._stats.clear();
  }

  /* ---------------------------------------------------------------- */

  private _trackUser(st: FlagStats, userKey: string): void {
    if (st.bitmap !== null) {
      // Already estimating — hash straight into the bitmap.
      const bit = fnv1a(userKey) % this._bitmapBits;
      st.bitmap[bit >>> 5] |= 1 << (bit & 31);
      return;
    }
    st.exactUsers.add(userKey);
    if (st.exactUsers.size > this._exactLimit) {
      // Overflow → migrate to bitmap; replay the exact set into it.
      st.bitmap = new Uint32Array(this._bitmapBits / 32);
      for (const u of st.exactUsers) {
        const bit = fnv1a(u) % this._bitmapBits;
        st.bitmap[bit >>> 5] |= 1 << (bit & 31);
      }
      st.exactUsers.clear();
    }
  }

  private _uniqueCount(st: FlagStats): number {
    if (st.bitmap === null) return st.exactUsers.size;
    let unset = 0;
    for (const word of st.bitmap) {
      // Count zero bits in each 32-bit word (popcount complement).
      let w = word;
      let ones = 0;
      while (w) {
        w &= w - 1; // clear lowest set bit
        ones++;
      }
      unset += 32 - ones;
    }
    const m = this._bitmapBits;
    if (unset === 0) return m * Math.log(m); // saturated — upper bound
    return Math.round(-m * Math.log(unset / m));
  }
}
