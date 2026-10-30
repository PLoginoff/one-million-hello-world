/**
 * False Positive Bank — turn dismissed alerts into suppression rules.
 *
 * When an analyst marks an alert as a false positive, the bank distills
 * a *signature* from the triggering event: the (rule, field-subset)
 * pair that would have produced that alert. Future alerts whose events
 * match the signature are suppressed *before* they hit the queue, and
 * the rule records how many it suppressed — the metric that tells you
 * whether the tuning is working or whether it's masking real signal.
 *
 * Signature extraction is conservative: only fields explicitly listed
 * in `signatureFields` are captured, never the whole event (a too-broad
 * signature would suppress unrelated alerts).
 *
 * @module SiemLayer/Engine2
 */

import { Alert } from '../engine/AlertManager';
import { NormalizedEvent } from '../engine/EventNormalizer';
import { IClock, SystemClock } from '../../observability/engine/signals';
import { SuppressionDecision, SuppressionRule } from './types';

export interface FpBankConfig {
  /** Event fields eligible for signatures. */
  readonly signatureFields: ReadonlyArray<string>;
  /** Auto-expire learned rules after this long (ms). 0 = never. */
  readonly ruleTtlMs: number;
  /** Cap on stored rules; oldest-lowest-utility evicted first. */
  readonly maxRules: number;
}

export const DEFAULT_FP_CONFIG: FpBankConfig = {
  signatureFields: ['user', 'sourceIp', 'destIp', 'action', 'sourceHost'],
  ruleTtlMs: 30 * 24 * 3_600_000,
  maxRules: 10_000,
};

export class FalsePositiveBank {
  private readonly _config: FpBankConfig;
  private readonly _clock: IClock;
  /** signatureKey → rule. */
  private readonly _rules = new Map<string, SuppressionRule>();
  private _seq = 0;

  constructor(config: FpBankConfig = DEFAULT_FP_CONFIG, clock: IClock = new SystemClock()) {
    this._config = config;
    this._clock = clock;
  }

  /**
   * Learn from a dismissed alert. `events` are the events that produced
   * it — we take the *most specific shared* field subset so the rule
   * suppresses exactly this pattern, not the whole rule.
   *
   * Returns the created/updated rule, or undefined when the events
   * share no signature-eligible fields (can't distill anything safe).
   */
  learn(alert: Alert, events: ReadonlyArray<NormalizedEvent>, dismissedBy?: string): SuppressionRule | undefined {
    const signature = distillSignature(events, this._config.signatureFields);
    if (!signature) return undefined;
    const key = sigKey(alert.ruleId, signature);
    const existing = this._rules.get(key);
    if (existing) {
      return existing;
    }
    this._seq += 1;
    const rule: SuppressionRule = {
      id: `fp-${this._seq}`,
      alertRuleId: alert.ruleId,
      signature,
      createdFromAlertId: alert.id,
      createdBy: dismissedBy,
      expiresAtMs:
        this._config.ruleTtlMs > 0 ? this._clock.nowMs() + this._config.ruleTtlMs : undefined,
      suppressedCount: 0,
    };
    this._rules.set(key, rule);
    this._evictIfNeeded();
    return rule;
  }

  /**
   * Should this (rule, event) pair be suppressed? First matching
   * signature wins and records the suppression.
   */
  check(alertRuleId: string, e: NormalizedEvent): SuppressionDecision {
    const now = this._clock.nowMs();
    for (const rule of this._rules.values()) {
      if (rule.alertRuleId !== alertRuleId) continue;
      if (rule.expiresAtMs !== undefined && now >= rule.expiresAtMs) continue;
      if (signatureMatches(rule.signature, e)) {
        rule.suppressedCount += 1;
        return { suppressed: true, ruleId: rule.id, reason: `matches FP signature from ${rule.createdFromAlertId}` };
      }
    }
    return { suppressed: false };
  }

  /** Manually add a signature (analyst-written tuning). */
  addRule(alertRuleId: string, signature: Record<string, string>, createdBy?: string): SuppressionRule {
    this._seq += 1;
    const key = sigKey(alertRuleId, signature);
    const existing = this._rules.get(key);
    if (existing) return existing;
    const rule: SuppressionRule = {
      id: `fp-${this._seq}`,
      alertRuleId,
      signature,
      createdFromAlertId: 'manual',
      createdBy,
      expiresAtMs:
        this._config.ruleTtlMs > 0 ? this._clock.nowMs() + this._config.ruleTtlMs : undefined,
      suppressedCount: 0,
    };
    this._rules.set(key, rule);
    this._evictIfNeeded();
    return rule;
  }

  rules(): ReadonlyArray<SuppressionRule> {
    return [...this._rules.values()];
  }

  /** Remove rules past their TTL; returns count removed. */
  sweep(): number {
    const now = this._clock.nowMs();
    let removed = 0;
    for (const [k, r] of this._rules) {
      if (r.expiresAtMs !== undefined && now >= r.expiresAtMs) {
        this._rules.delete(k);
        removed += 1;
      }
    }
    return removed;
  }

  private _evictIfNeeded(): void {
    if (this._rules.size <= this._config.maxRules) return;
    // Evict the lowest-utility rules first (fewest suppressions).
    const sorted = [...this._rules.entries()].sort(
      (a, b) => a[1].suppressedCount - b[1].suppressedCount,
    );
    while (this._rules.size > this._config.maxRules) {
      const victim = sorted.shift();
      if (!victim) break;
      this._rules.delete(victim[0]);
    }
  }
}

/**
 * Distill the shared signature across a set of events: the fields on
 * `allow` that have the *same* non-empty value on every event. An
 * empty signature means the events don't agree on anything — no rule.
 */
export function distillSignature(
  events: ReadonlyArray<NormalizedEvent>,
  allow: ReadonlyArray<string>,
): Record<string, string> | undefined {
  if (events.length === 0) return undefined;
  const sig: Record<string, string> = {};
  const fieldValue = (e: NormalizedEvent, f: string): string | undefined => {
    switch (f) {
      case 'user': return e.user;
      case 'sourceIp': return e.sourceIp;
      case 'destIp': return e.destIp;
      case 'sourceHost': return e.sourceHost;
      case 'action': return e.action;
      default: return e.fields[f];
    }
  };
  for (const f of allow) {
    const v0 = fieldValue(events[0], f);
    if (v0 === undefined || v0 === '') continue;
    if (events.every((e) => fieldValue(e, f) === v0)) sig[f] = v0;
  }
  return Object.keys(sig).length > 0 ? sig : undefined;
}

/** Does an event satisfy every field of the signature? */
export function signatureMatches(sig: Record<string, string>, e: NormalizedEvent): boolean {
  for (const [f, v] of Object.entries(sig)) {
    let actual: string | undefined;
    switch (f) {
      case 'user': actual = e.user; break;
      case 'sourceIp': actual = e.sourceIp; break;
      case 'destIp': actual = e.destIp; break;
      case 'sourceHost': actual = e.sourceHost; break;
      case 'action': actual = e.action; break;
      default: actual = e.fields[f];
    }
    if (actual !== v) return false;
  }
  return true;
}

function sigKey(ruleId: string, sig: Record<string, string>): string {
  const parts = Object.keys(sig)
    .sort()
    .map((k) => `${k}=${sig[k]}`)
    .join('&');
  return `${ruleId}|${parts}`;
}
