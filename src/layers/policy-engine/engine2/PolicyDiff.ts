/**
 * Policy Engine — Policy-Set Diffing
 *
 * Structural comparison of two {@link PolicySet}/{@link Policy} trees —
 * the "what changed?" report for review and release notes.
 *
 * Diff dimensions:
 *  - Policies added / removed between the sets (matched by id).
 *  - Per-policy: rules added / removed / modified (matched by rule id;
 *    modifications list the changed fields), combining-algorithm changes,
 *    target changes, enable/disable flips.
 *  - Combining algorithm changes at the policy-set level.
 *
 * Comparison is JSON-structural — two syntactically different but
 * equivalent expressions (e.g. `and` children reordered) are reported as
 * modified; semantic equivalence is out of scope (undecidable in general).
 *
 * @module PolicyEngine/Engine2
 */

import {
  CombiningAlgorithm,
  Policy,
  PolicyRule,
  PolicySet,
  isPolicySet,
} from '../domain/policy-model';

export type PolicyElement = Policy | PolicySet;

export type ChangeKind =
  | 'policy-added'
  | 'policy-removed'
  | 'rule-added'
  | 'rule-removed'
  | 'rule-modified'
  | 'policy-modified'
  | 'combining-changed'
  | 'policy-toggled';

export interface PolicyChange {
  readonly kind: ChangeKind;
  readonly policyId: string;
  readonly ruleId?: string;
  /** Human-readable detail. */
  readonly detail: string;
  /** For modifications: the fields that changed. */
  readonly changedFields?: ReadonlyArray<string>;
}

export interface PolicySetDiffReport {
  readonly fromId: string;
  readonly toId: string;
  readonly changes: ReadonlyArray<PolicyChange>;
  readonly addedPolicies: number;
  readonly removedPolicies: number;
  readonly modifiedPolicies: number;
}

function json(v: unknown): string {
  return JSON.stringify(v ?? null);
}

function ruleChanges(a: PolicyRule, b: PolicyRule): string[] {
  const fields: string[] = [];
  if (a.effect !== b.effect) fields.push('effect');
  if (json(a.target) !== json(b.target)) fields.push('target');
  if (json(a.condition) !== json(b.condition)) fields.push('condition');
  if (json(a.obligations) !== json(b.obligations)) fields.push('obligations');
  if (json(a.advice) !== json(b.advice)) fields.push('advice');
  if ((a.enabled ?? true) !== (b.enabled ?? true)) fields.push('enabled');
  return fields;
}

function policyChanges(a: Policy, b: Policy): string[] {
  const fields: string[] = [];
  if (a.ruleCombining !== b.ruleCombining) fields.push('ruleCombining');
  if (json(a.target) !== json(b.target)) fields.push('target');
  if (json(a.obligations) !== json(b.obligations)) fields.push('obligations');
  if (json(a.advice) !== json(b.advice)) fields.push('advice');
  if ((a.enabled ?? true) !== (b.enabled ?? true)) fields.push('enabled');
  if ((a.version ?? '') !== (b.version ?? '')) fields.push('version');
  return fields;
}

/** Flatten nested policy sets into a map: id → element (depth-first). */
function flatten(root: PolicyElement): Map<string, PolicyElement> {
  const out = new Map<string, PolicyElement>();
  const walk = (el: PolicyElement): void => {
    out.set(el.id, el);
    if (isPolicySet(el)) {
      for (const child of el.policies) walk(child);
    }
  };
  walk(root);
  return out;
}

export class PolicyDiffer {
  /**
   * Diff two policy trees. `fromId`/`toId` label the report; pass the
   * elements' bundle ids when diffing bundles.
   */
  diff(from: PolicyElement, to: PolicyElement, fromId = 'from', toId = 'to'): PolicySetDiffReport {
    const aMap = flatten(from);
    const bMap = flatten(to);
    const changes: PolicyChange[] = [];
    let addedPolicies = 0, removedPolicies = 0, modifiedPolicies = 0;

    // Top-level combining difference.
    if (isPolicySet(from) && isPolicySet(to) && from.policyCombining !== to.policyCombining) {
      changes.push({
        kind: 'combining-changed',
        policyId: to.id,
        detail: `policy-combining ${from.policyCombining} → ${to.policyCombining}`,
      });
    }

    for (const [id, bEl] of bMap) {
      const aEl = aMap.get(id);
      if (!aEl) {
        changes.push({ kind: 'policy-added', policyId: id, detail: `policy '${id}' added` });
        addedPolicies++;
        continue;
      }
      // Both exist — sets vs sets, policies vs policies.
      if (isPolicySet(aEl) !== isPolicySet(bEl)) {
        changes.push({
          kind: 'policy-modified',
          policyId: id,
          detail: `element kind changed (${isPolicySet(aEl) ? 'PolicySet' : 'Policy'} → ${isPolicySet(bEl) ? 'PolicySet' : 'Policy'})`,
        });
        modifiedPolicies++;
        continue;
      }
      if (isPolicySet(aEl) && isPolicySet(bEl)) {
        if (aEl.policyCombining !== bEl.policyCombining) {
          changes.push({
            kind: 'combining-changed',
            policyId: id,
            detail: `policy-combining ${aEl.policyCombining} → ${bEl.policyCombining}`,
          });
          modifiedPolicies++;
        }
        continue;
      }
      // Two Policies — compare metadata then rules.
      const a = aEl as Policy, b = bEl as Policy;
      const pChanges = policyChanges(a, b);
      if (pChanges.length > 0) {
        const toggled = pChanges.length === 1 && pChanges[0] === 'enabled';
        changes.push({
          kind: toggled ? 'policy-toggled' : 'policy-modified',
          policyId: id,
          detail: toggled
            ? `policy ${b.enabled === false ? 'disabled' : 'enabled'}`
            : `policy fields changed: ${pChanges.join(', ')}`,
          changedFields: pChanges,
        });
        modifiedPolicies++;
      }
      const aRules = new Map(a.rules.map((r) => [r.id, r]));
      const bRules = new Map(b.rules.map((r) => [r.id, r]));
      for (const [rid, rb] of bRules) {
        const ra = aRules.get(rid);
        if (!ra) {
          changes.push({
            kind: 'rule-added',
            policyId: id,
            ruleId: rid,
            detail: `rule '${rid}' (${rb.effect}) added to '${id}'`,
          });
        } else {
          const rf = ruleChanges(ra, rb);
          if (rf.length > 0) {
            changes.push({
              kind: 'rule-modified',
              policyId: id,
              ruleId: rid,
              detail: `rule '${rid}' fields changed: ${rf.join(', ')}`,
              changedFields: rf,
            });
          }
        }
      }
      for (const rid of aRules.keys()) {
        if (!bRules.has(rid)) {
          changes.push({
            kind: 'rule-removed',
            policyId: id,
            ruleId: rid,
            detail: `rule '${rid}' removed from '${id}'`,
          });
        }
      }
    }
    for (const id of aMap.keys()) {
      if (!bMap.has(id)) {
        changes.push({ kind: 'policy-removed', policyId: id, detail: `policy '${id}' removed` });
        removedPolicies++;
      }
    }

    return { fromId, toId, changes, addedPolicies, removedPolicies, modifiedPolicies };
  }
}
