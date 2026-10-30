/**
 * RateRule — sliding-window rate-based rules.
 *
 * Each rate rule counts matching requests per *partition key* (client IP
 * by default, or any request-derived key like a header) in a sliding
 * window. Once the count in the window crosses `threshold`, the rule
 * fires for `blockMs` — during which further matching requests are
 * blocked without needing to re-measure.
 *
 * Implementation: per-partition ring of per-second buckets (same design
 * as BackendMetrics' RPS counter). Count is O(windowSec); expiry is
 * implicit in bucket timestamps — no timers needed.
 *
 * @module WafLayer/Engine2
 */

import { WafClock2, WafRequest2, SystemWafClock2 } from './types';
import { CompiledDsl } from './RuleDsl';

export interface RateRuleOptions {
  readonly ruleId: string;
  /** DSL expression — only matching requests are counted. */
  readonly when: string;
  /** Requests per window that trigger the rule. */
  readonly threshold: number;
  /** Window length in ms. Default 60_000. */
  readonly windowMs?: number;
  /** How long a tripped partition stays blocked in ms. Default 300_000. */
  readonly blockMs?: number;
  /** Partition key extractor. Default: clientIp. */
  readonly keyOf?: (req: WafRequest2) => string;
  /** Action when tripped. Default 'block'. */
  readonly action?: 'block' | 'log' | 'captcha';
}

interface Partition {
  /** Ring of {epochSec, count} buckets. */
  buckets: { epochSec: number; count: number }[];
  /** Epoch ms until which this partition is blocked. */
  blockedUntilMs: number;
}

export class RateRule {
  readonly ruleId: string;
  private readonly _when: CompiledDsl;
  private readonly _threshold: number;
  private readonly _windowSec: number;
  private readonly _blockMs: number;
  private readonly _keyOf: (req: WafRequest2) => string;
  private readonly _action: 'block' | 'log' | 'captcha';
  private readonly _clock: WafClock2;
  private readonly _partitions = new Map<string, Partition>();
  private _trips = 0;

  constructor(opts: RateRuleOptions, clock: WafClock2 = new SystemWafClock2()) {
    this.ruleId = opts.ruleId;
    this._when = new CompiledDsl(opts.when);
    this._threshold = Math.max(1, opts.threshold);
    const windowMs = Math.max(1_000, opts.windowMs ?? 60_000);
    this._windowSec = Math.ceil(windowMs / 1000);
    this._blockMs = Math.max(1, opts.blockMs ?? 300_000);
    this._keyOf = opts.keyOf ?? ((r) => r.clientIp);
    this._action = opts.action ?? 'block';
    this._clock = clock;
  }

  /**
   * Observe a request. Returns the verdict if the rule fires (threshold
   * crossed or partition still in its block window), else null.
   */
  observe(req: WafRequest2): { action: 'block' | 'log' | 'captcha'; ruleId: string; reason: string } | null {
    if (!this._when.matches(req)) return null;

    const key = this._keyOf(req);
    const now = this._clock.now();
    const p = this._partition(key);

    // Already in a block window → keep blocking without re-counting.
    if (now < p.blockedUntilMs) {
      return this._fire(key, true);
    }

    const epochSec = Math.floor(now / 1000);
    const slot = p.buckets[epochSec % this._windowSec];
    if (slot.epochSec !== epochSec) {
      slot.epochSec = epochSec;
      slot.count = 0;
    }
    slot.count++;

    if (this._countInWindow(p, epochSec) > this._threshold) {
      p.blockedUntilMs = now + this._blockMs;
      this._trips++;
      return this._fire(key, false);
    }
    return null;
  }

  /** Is a partition currently blocked? */
  isBlocked(key: string): boolean {
    const p = this._partitions.get(key);
    return !!p && this._clock.now() < p.blockedUntilMs;
  }

  /** Current window count for a partition. */
  countFor(key: string): number {
    const p = this._partitions.get(key);
    if (!p) return 0;
    return this._countInWindow(p, Math.floor(this._clock.now() / 1000));
  }

  /** Manually release a partition's block. */
  release(key: string): boolean {
    const p = this._partitions.get(key);
    if (!p || p.blockedUntilMs === 0) return false;
    p.blockedUntilMs = 0;
    return true;
  }

  /** Drop partitions with no live counts and no active block. */
  sweep(): number {
    const nowSec = Math.floor(this._clock.now() / 1000);
    const now = this._clock.now();
    let n = 0;
    for (const [k, p] of this._partitions) {
      if (now < p.blockedUntilMs) continue;
      if (this._countInWindow(p, nowSec) === 0) {
        this._partitions.delete(k);
        n++;
      }
    }
    return n;
  }

  get tripCount(): number {
    return this._trips;
  }

  get partitionCount(): number {
    return this._partitions.size;
  }

  /* ---------------------------------------------------------------- */

  private _partition(key: string): Partition {
    let p = this._partitions.get(key);
    if (!p) {
      p = {
        buckets: Array.from({ length: this._windowSec }, () => ({ epochSec: -1, count: 0 })),
        blockedUntilMs: 0,
      };
      this._partitions.set(key, p);
    }
    return p;
  }

  private _countInWindow(p: Partition, nowSec: number): number {
    let sum = 0;
    for (const b of p.buckets) {
      if (b.epochSec > nowSec - this._windowSec) sum += b.count;
    }
    return sum;
  }

  private _fire(key: string, sustained: boolean) {
    return {
      action: this._action,
      ruleId: this.ruleId,
      reason: sustained
        ? `partition '${key}' still in block window`
        : `rate exceeded: >${this._threshold}/${this._windowSec}s for '${key}'`,
    };
  }
}
