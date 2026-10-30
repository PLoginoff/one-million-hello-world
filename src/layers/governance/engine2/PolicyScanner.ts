/**
 * Policy Violation Scanner
 *
 * Scans a set of flat-attribute configuration objects against
 * declarative {@link PolicyRule}s and reports every violation. This is
 * the config-compliance side of governance: not "what is the policy"
 * but "which running resources break it".
 *
 * Rules are attribute predicates on a config `kind`:
 *   { kind:'bucket', field:'encryption', op:'equals', value:'aes256' }
 * flags every bucket whose `encryption` attribute isn't 'aes256'.
 *
 * Supported ops:
 * - `equals` / `not-equals` — strict equality after String() coercion
 *   for numbers/booleans
 * - `contains` — value is a substring/element of the attribute
 * - `missing` / `present` — attribute absent vs. present
 * - `gt` / `lt` — numeric comparison
 *
 * Scan is O(C × R) — C configs against R rules of the same kind;
 * rules are bucketed by kind so configs only test relevant rules.
 *
 * @module GovernanceLayer/Engine2
 */

import { IClock, PolicyRule, ScannableConfig, SystemClock, Violation } from './types';

export class PolicyScanner {
  /** kind -> rules applying to that config kind. */
  private readonly _rules: Map<string, PolicyRule[]>;
  private readonly _clock: IClock;

  constructor(clock: IClock = new SystemClock()) {
    this._rules = new Map();
    this._clock = clock;
  }

  /** Register a rule. */
  addRule(rule: PolicyRule): void {
    let list = this._rules.get(rule.kind);
    if (!list) {
      list = [];
      this._rules.set(rule.kind, list);
    }
    list.push(rule);
  }

  /** Remove a rule by id. */
  removeRule(ruleId: string): boolean {
    for (const [kind, list] of this._rules.entries()) {
      const idx = list.findIndex((r) => r.id === ruleId);
      if (idx >= 0) {
        list.splice(idx, 1);
        if (list.length === 0) this._rules.delete(kind);
        return true;
      }
    }
    return false;
  }

  /**
   * Scan `configs` and return every detected violation, sorted by
   * severity (critical first) then config id.
   */
  scan(configs: readonly ScannableConfig[]): Violation[] {
    const now = this._clock.now();
    const out: Violation[] = [];
    for (const cfg of configs) {
      const rules = this._rules.get(cfg.kind);
      if (!rules) continue;
      for (const rule of rules) {
        if (this._violates(cfg, rule)) {
          out.push({
            ruleId: rule.id,
            configId: cfg.id,
            severity: rule.severity,
            observed: cfg.attrs[rule.field],
            at: now,
          });
        }
      }
    }
    const rank = { critical: 0, high: 1, medium: 2, low: 3 };
    out.sort((a, b) => rank[a.severity] - rank[b.severity] || a.configId.localeCompare(b.configId));
    return out;
  }

  /** Just the violating configs — the actionable list. */
  violatingConfigs(configs: readonly ScannableConfig[]): string[] {
    return [...new Set(this.scan(configs).map((v) => v.configId))];
  }

  // ------------------------------------------------------------------
  // predicate evaluation
  // ------------------------------------------------------------------

  private _violates(cfg: ScannableConfig, rule: PolicyRule): boolean {
    const has = rule.field in cfg.attrs;
    const val = cfg.attrs[rule.field];
    switch (rule.op) {
      case 'missing':
        // Violation when the required field is ABSENT.
        return !has;
      case 'present':
        // Violation when a forbidden field is PRESENT.
        return has;
      case 'equals':
        return has && String(val) !== String(rule.value);
      case 'not-equals':
        return has && String(val) === String(rule.value);
      case 'contains': {
        if (!has) return false;
        if (Array.isArray(val)) return !val.includes(rule.value);
        return !String(val).includes(String(rule.value));
      }
      case 'gt':
        return has && typeof val === 'number' && !(val > Number(rule.value));
      case 'lt':
        return has && typeof val === 'number' && !(val < Number(rule.value));
      default:
        return false;
    }
  }
}
