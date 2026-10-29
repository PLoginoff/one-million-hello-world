/**
 * Data Classification Engine
 *
 * Assigns data classification tiers (public / internal / confidential /
 * restricted) to resources using an ordered rule set, and resolves the
 * handling obligations attached to each tier.
 *
 * Rule evaluation is first-match-wins on ascending `priority`; ties break
 * toward the *more restrictive* tier so ambiguous configurations fail
 * closed rather than open. Manual overrides always beat rules.
 *
 * Complexity: classification is O(R) per resource where R = rule count
 * (rules are kept sorted so typical workloads exit on the first match).
 *
 * @module GovernanceLayer/Engines
 */

import {
  ClassificationResult,
  ClassificationRule,
  ClassificationTier,
  HandlingRules,
  IClock,
  SystemClock,
  TIER_RANK,
} from './types';

/** Default handling rules per tier — sensible, progressively stricter. */
export const DEFAULT_HANDLING_RULES: Readonly<Record<ClassificationTier, HandlingRules>> = {
  [ClassificationTier.Public]: {
    tier: ClassificationTier.Public,
    encryptionAtRest: false,
    encryptionInTransit: false,
    maskingRequired: false,
    auditLogging: false,
    allowedSharingScopes: ['public', 'organization', 'team', 'named-users'],
    maxRetentionDays: null,
    requiresDualControl: false,
  },
  [ClassificationTier.Internal]: {
    tier: ClassificationTier.Internal,
    encryptionAtRest: true,
    encryptionInTransit: true,
    maskingRequired: false,
    auditLogging: false,
    allowedSharingScopes: ['organization', 'team', 'named-users'],
    maxRetentionDays: null,
    requiresDualControl: false,
  },
  [ClassificationTier.Confidential]: {
    tier: ClassificationTier.Confidential,
    encryptionAtRest: true,
    encryptionInTransit: true,
    maskingRequired: true,
    auditLogging: true,
    allowedSharingScopes: ['team', 'named-users'],
    maxRetentionDays: 2555, // ~7 years
    requiresDualControl: false,
  },
  [ClassificationTier.Restricted]: {
    tier: ClassificationTier.Restricted,
    encryptionAtRest: true,
    encryptionInTransit: true,
    maskingRequired: true,
    auditLogging: true,
    allowedSharingScopes: ['named-users'],
    maxRetentionDays: 365,
    requiresDualControl: true,
  },
};

export class DataClassificationEngine {
  private _rules: ClassificationRule[];
  private _handling: Map<ClassificationTier, HandlingRules>;
  private _overrides: Map<string, ClassificationTier>;
  private _results: Map<string, ClassificationResult>;
  private readonly _clock: IClock;

  constructor(clock: IClock = new SystemClock()) {
    this._rules = [];
    this._handling = new Map(
      Object.values(DEFAULT_HANDLING_RULES).map((r) => [r.tier, { ...r }])
    );
    this._overrides = new Map();
    this._results = new Map();
    this._clock = clock;
  }

  /**
   * Register a classification rule. Rules are re-sorted on insert so
   * evaluation order is always (priority asc, tier restrictiveness desc).
   */
  addRule(rule: ClassificationRule): void {
    if (this._rules.some((r) => r.id === rule.id)) {
      throw new Error(`Duplicate classification rule id: ${rule.id}`);
    }
    if (rule.regex) {
      // Validate eagerly — a bad pattern should fail at registration time.
      new RegExp(rule.pattern, 'i');
    }
    this._rules.push(rule);
    this._rules.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return TIER_RANK[b.tier] - TIER_RANK[a.tier];
    });
  }

  removeRule(ruleId: string): boolean {
    const before = this._rules.length;
    this._rules = this._rules.filter((r) => r.id !== ruleId);
    return this._rules.length !== before;
  }

  getRules(): ReadonlyArray<ClassificationRule> {
    return this._rules;
  }

  /** Replace the handling rules attached to a tier. */
  setHandlingRules(rules: HandlingRules): void {
    this._handling.set(rules.tier, { ...rules, allowedSharingScopes: [...rules.allowedSharingScopes] });
  }

  /** Get the effective handling rules for a tier (always defined). */
  getHandlingRules(tier: ClassificationTier): HandlingRules {
    const rules = this._handling.get(tier);
    if (!rules) {
      throw new Error(`No handling rules registered for tier: ${tier}`);
    }
    return rules;
  }

  /**
   * Pin a resource to a tier manually. Overrides survive re-classification
   * and are returned instead of any rule match.
   */
  setOverride(resourceId: string, tier: ClassificationTier): void {
    this._overrides.set(resourceId, tier);
    this._results.delete(resourceId); // force re-classification
  }

  clearOverride(resourceId: string): boolean {
    const removed = this._overrides.delete(resourceId);
    if (removed) this._results.delete(resourceId);
    return removed;
  }

  /**
   * Classify a resource. `fields` is the resource's tag/metadata map; the
   * special field name '*' matches against `resourceId` itself.
   *
   * The matched tier is the FIRST rule in sorted order whose pattern
   * matches — but a lower-priority rule may still produce a *more
   * restrictive* tier: when multiple rules at the same priority match we
   * pick the highest-ranked tier among them (fail closed).
   */
  classify(resourceId: string, fields: Readonly<Record<string, string>> = {}): ClassificationResult {
    const overrideTier = this._overrides.get(resourceId);
    if (overrideTier !== undefined) {
      const result: ClassificationResult = {
        resourceId,
        tier: overrideTier,
        matchedRuleId: null,
        manualOverride: true,
        classifiedAt: this._clock.now(),
      };
      this._results.set(resourceId, result);
      return result;
    }

    let matched: ClassificationRule | null = null;
    let bestPriority = Number.POSITIVE_INFINITY;

    for (const rule of this._rules) {
      if (rule.priority > bestPriority) break; // sorted — no better matches remain
      if (!this._matches(rule, resourceId, fields)) continue;

      if (matched === null || rule.priority < bestPriority) {
        matched = rule;
        bestPriority = rule.priority;
      } else if (rule.priority === bestPriority && TIER_RANK[rule.tier] > TIER_RANK[matched.tier]) {
        matched = rule; // same priority, more restrictive tier wins
      }
    }

    const result: ClassificationResult = {
      resourceId,
      tier: matched ? matched.tier : ClassificationTier.Internal, // safe default
      matchedRuleId: matched ? matched.id : null,
      manualOverride: false,
      classifiedAt: this._clock.now(),
    };
    this._results.set(resourceId, result);
    return result;
  }

  /** Classify many resources; returns results in input order. */
  classifyBatch(
    resources: ReadonlyArray<{ resourceId: string; fields?: Record<string, string> }>
  ): ClassificationResult[] {
    return resources.map((r) => this.classify(r.resourceId, r.fields ?? {}));
  }

  /** Last classification result for a resource, if any. */
  getResult(resourceId: string): ClassificationResult | null {
    return this._results.get(resourceId) ?? null;
  }

  /**
   * Re-tier every previously classified resource whose tier did NOT come
   * from a manual override. Call after mutating the rule set.
   * Returns the count of resources whose tier changed.
   *
   * NOTE: re-classification needs the original fields; resources are
   * re-evaluated with their stored tag snapshot.
   */
  reclassifyAll(snapshots: ReadonlyMap<string, Record<string, string>>): number {
    let changed = 0;
    for (const [resourceId, fields] of snapshots) {
      const before = this._results.get(resourceId)?.tier;
      const after = this.classify(resourceId, fields).tier;
      if (before !== undefined && before !== after) changed++;
    }
    return changed;
  }

  /**
   * Whether `action` is permitted on data of `tier` by `scope`.
   * Scope must appear in the tier's allowed sharing scopes.
   */
  isSharingAllowed(tier: ClassificationTier, scope: 'public' | 'organization' | 'team' | 'named-users'): boolean {
    return this.getHandlingRules(tier).allowedSharingScopes.includes(scope);
  }

  private _matches(
    rule: ClassificationRule,
    resourceId: string,
    fields: Readonly<Record<string, string>>
  ): boolean {
    const value = rule.field === '*' ? resourceId : fields[rule.field];
    if (value === undefined) return false;
    if (rule.regex) {
      return new RegExp(rule.pattern, 'i').test(value);
    }
    return value.toLowerCase().includes(rule.pattern.toLowerCase());
  }
}
