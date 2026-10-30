/**
 * ThrottleChain — ordered composition of rules with early exit.
 *
 * Chains let you stack orthogonal limits — region cap → tier cap →
 * burst-credit — and get a single verdict. Evaluation stops at the first
 * denial (early exit), which matters twice over: it saves work, and it
 * keeps downstream rules' counters from being consumed by requests that
 * were never going to be allowed anyway. Without early exit, a request
 * rejected at region level would still burn the caller's tier allowance.
 *
 * Deny reporting: the verdict names the *first* denying rule
 * (`decidedBy`), and the chain exposes `lastDenials` so analytics can
 * attribute rejection reasons per rule without replaying evaluations.
 *
 * Rule order is policy: cheap, broad filters (geo/IP) first so expensive
 * or stateful rules (credits, per-user quotas) only see surviving traffic.
 *
 * Complexity: O(#rules) worst case, early exit when any rule denies.
 *
 * @module ThrottlingLayer/Engine2
 */

import { ThrottleRule, ThrottleVerdict } from './types';

export interface DenialRecord {
  readonly rule: string;
  readonly key: string;
  readonly atMs: number;
  readonly reason?: string;
}

export interface ThrottleChainOptions {
  /** Clock for denial records. Defaults to Date.now. */
  now?: () => number;
}

export class ThrottleChain {
  private readonly _rules: ThrottleRule[] = [];
  private readonly _now: () => number;
  private readonly _denials: DenialRecord[] = [];
  private static readonly MAX_DENIALS = 1000;

  constructor(opts: ThrottleChainOptions = {}) {
    this._now = opts.now ?? Date.now;
  }

  /** Append a rule — evaluated in insertion order. */
  add(rule: ThrottleRule): this {
    this._rules.push(rule);
    return this;
  }

  /**
   * Evaluate `key` through the chain. Returns the first denial, or the
   * last rule's verdict when everything passes (its remaining is the
   * tightest margin seen).
   */
  evaluate(key: string, cost: number = 1): ThrottleVerdict {
    let tightest: ThrottleVerdict | null = null;
    for (const rule of this._rules) {
      const v = rule.evaluate(key, cost);
      if (!v.allowed) {
        this._recordDenial({ rule: rule.name, key, atMs: this._now(), reason: v.reason });
        return { ...v, decidedBy: `${v.decidedBy} (via ${rule.name})` };
      }
      if (!tightest || (v.remaining !== undefined && (tightest.remaining === undefined || v.remaining < tightest.remaining))) {
        tightest = v;
      }
    }
    return tightest ?? { allowed: true, decidedBy: 'chain:empty' };
  }

  /** Recent denials for analytics (ring buffer, newest last). */
  get lastDenials(): readonly DenialRecord[] {
    return this._denials;
  }

  /** Denial counts per rule name. */
  denialBreakdown(): Map<string, number> {
    const m = new Map<string, number>();
    for (const d of this._denials) m.set(d.rule, (m.get(d.rule) ?? 0) + 1);
    return m;
  }

  private _recordDenial(d: DenialRecord): void {
    this._denials.push(d);
    if (this._denials.length > ThrottleChain.MAX_DENIALS) {
      this._denials.splice(0, this._denials.length - ThrottleChain.MAX_DENIALS);
    }
  }
}
