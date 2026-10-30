/**
 * Policy Engine engine2 — unit tests (bun:test)
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { PolicySimulator } from '../engine2/PolicySimulator';
import { PolicyDiffer } from '../engine2/PolicyDiff';
import { PolicyBundleStore, BundleError, computeDigest, satisfies, PolicyBundle } from '../engine2/PolicyBundler';
import { DecisionExplainer } from '../engine2/DecisionExplainer';
import { Policy, PolicySet, PolicyRequest, x } from '../domain/policy-model';

const adminPolicy: Policy = {
  id: 'admin-access',
  ruleCombining: 'deny-overrides',
  rules: [
    { id: 'admins-ok', effect: 'permit', condition: x.eq(x.subject('role'), x.lit('admin')) },
    { id: 'deny-suspended', effect: 'deny', condition: x.eq(x.subject('suspended'), x.lit(true)) },
  ],
};

const financePolicy: Policy = {
  id: 'finance-docs',
  target: { allOf: [{ category: 'resource', path: 'classification', op: 'eq', value: 'confidential' }] },
  ruleCombining: 'deny-overrides',
  rules: [
    { id: 'finance-team', effect: 'permit', condition: x.eq(x.subject('team'), x.lit('finance')) },
    { id: 'auditors', effect: 'permit', condition: x.eq(x.subject('team'), x.lit('audit')) },
  ],
};

const rootSet: PolicySet = {
  id: 'root',
  policyCombining: 'deny-overrides',
  policies: [adminPolicy, financePolicy],
};

const req = (subject: Record<string, unknown>, resource: Record<string, unknown>, action = 'read'): PolicyRequest => ({
  subject,
  resource,
  action,
});

// ------------------------------------------------------------ PolicySimulator

describe('PolicySimulator', () => {
  const sim = new PolicySimulator(rootSet);

  it('permits admin reads', () => {
    const r = sim.wouldAllow(req({ role: 'admin' }, { classification: 'public' }));
    expect(r.effect).toBe('permit');
  });

  it('deny overrides permit for suspended admins', () => {
    const r = sim.wouldAllow(req({ role: 'admin', suspended: true }, { classification: 'public' }));
    expect(r.effect).toBe('deny');
    expect(r.explanation.decidingRuleIds).toContain('deny-suspended');
  });

  it('notApplicable when nothing matches', () => {
    const r = sim.wouldAllow(req({ role: 'viewer' }, { classification: 'public' }));
    expect(r.effect).toBe('notApplicable');
  });

  it('runSuite flags regressions', () => {
    const report = sim.runSuite([
      { name: 'admin reads public', request: req({ role: 'admin' }, { classification: 'public' }), expect: 'permit' },
      { name: 'viewer reads public', request: req({ role: 'viewer' }, { classification: 'public' }), expect: 'permit' }, // wrong — should fail
      { name: 'finance reads confidential', request: req({ team: 'finance' }, { classification: 'confidential' }), expect: 'permit' },
    ]);
    expect(report.total).toBe(3);
    expect(report.failed).toBe(1);
    const bad = report.outcomes.find((o) => !o.passed)!;
    expect(bad.scenario.name).toContain('viewer');
    expect(bad.narrative!.length).toBeGreaterThan(0);
  });

  it('attributeSweep finds decision boundaries', () => {
    const policy: Policy = {
      id: 'clearance',
      ruleCombining: 'deny-overrides',
      rules: [{ id: 'needs-3', effect: 'permit', condition: x.gte(x.subject('clearance'), x.lit(3)) }],
    };
    const s = new PolicySimulator(policy);
    const report = s.attributeSweep(req({}, {}, 'read'), 'subject', 'clearance', [1, 2, 3, 4, 5]);
    expect(report.points.map((p) => p.effect)).toEqual([
      'notApplicable', 'notApplicable', 'permit', 'permit', 'permit',
    ]);
    expect(report.boundaries).toEqual([2]); // flips at index 2 (clearance=3)
  });
});

// ------------------------------------------------------------ DecisionExplainer

describe('DecisionExplainer', () => {
  const explainer = new DecisionExplainer();

  it('traces why a request was denied', () => {
    const e = explainer.explain(
      rootSet,
      req({ role: 'admin', suspended: true }, { classification: 'public' })
    );
    expect(e.decision).toBe('deny');
    const admin = e.trace.children.find((c) => c.id === 'admin-access')!;
    const denyRule = admin.children.find((c) => c.id === 'deny-suspended')!;
    expect(denyRule.verdict).toBe('applicable');
    expect(denyRule.effect).toBe('deny');
  });

  it('marks target-miss policies', () => {
    const e = explainer.explain(rootSet, req({ team: 'finance' }, { classification: 'public' }));
    const finance = e.trace.children.find((c) => c.id === 'finance-docs')!;
    expect(finance.verdict).toBe('target-miss');
  });

  it('narrative produces readable lines', () => {
    const e = explainer.explain(rootSet, req({ role: 'admin' }, { classification: 'public' }));
    const lines = explainer.narrative(e);
    expect(lines.some((l) => l.includes("policy 'admin-access'"))).toBe(true);
    expect(lines).toContain('decision: permit');
    expect(lines[lines.length - 1]).toBe('deciding rules: admins-ok');
  });
});

// ------------------------------------------------------------ PolicyDiffer

describe('PolicyDiffer', () => {
  const differ = new PolicyDiffer();

  it('detects added/removed/modified rules', () => {
    const v2admin: Policy = {
      ...adminPolicy,
      rules: [
        { id: 'admins-ok', effect: 'permit', condition: x.eq(x.subject('role'), x.lit('superadmin')) }, // modified
        { id: 'auditors', effect: 'permit', condition: x.eq(x.subject('team'), x.lit('audit')) }, // added
        // deny-suspended removed
      ],
    };
    const report = differ.diff(
      { ...rootSet, policies: [adminPolicy] },
      { ...rootSet, policies: [v2admin] }
    );
    const kinds = report.changes.map((c) => c.kind);
    expect(kinds).toContain('rule-added');
    expect(kinds).toContain('rule-removed');
    expect(kinds).toContain('rule-modified');
  });

  it('detects added and removed policies', () => {
    const report = differ.diff(
      { ...rootSet, policies: [adminPolicy, financePolicy] },
      { ...rootSet, policies: [adminPolicy] }
    );
    expect(report.removedPolicies).toBe(1);
    expect(report.changes[0].kind).toBe('policy-removed');
  });

  it('detects combining-algorithm changes', () => {
    const changed: Policy = { ...adminPolicy, ruleCombining: 'permit-overrides' };
    const report = differ.diff(adminPolicy, changed);
    expect(report.changes.some((c) => c.kind === 'policy-modified' && c.changedFields!.includes('ruleCombining'))).toBe(true);
  });

  it('identical sets produce no changes', () => {
    const report = differ.diff(rootSet, rootSet);
    expect(report.changes).toHaveLength(0);
  });
});

// ------------------------------------------------------------ PolicyBundleStore

describe('PolicyBundleStore', () => {
  let store: PolicyBundleStore;

  const bundle = (name: string, version: string, root: PolicySet, deps: { name: string; range: string }[] = []): PolicyBundle => ({
    name,
    version,
    root,
    dependencies: deps,
  });

  beforeEach(() => {
    store = new PolicyBundleStore();
  });

  it('semver satisfies ranges', () => {
    expect(satisfies('2.1.0', '>=2.0.0')).toBe(true);
    expect(satisfies('1.9.9', '>=2.0.0')).toBe(false);
    expect(satisfies('2.0.0', '=2.0.0')).toBe(true);
    expect(satisfies('2.0.1', '=2.0.0')).toBe(false);
  });

  it('resolves a bundle with dependencies — flattened, deps first', () => {
    store.publish(bundle('base', '1.0.0', { id: 'base-root', policyCombining: 'deny-overrides', policies: [adminPolicy] }));
    store.publish(bundle('app', '2.0.0', { id: 'app-root', policyCombining: 'deny-overrides', policies: [financePolicy] }, [{ name: 'base', range: '>=1.0.0' }]));
    const r = store.resolve('app', '2.0.0');
    const ids = r.effectivePolicySet.policies.map((p) => p.id);
    expect(ids).toEqual(['admin-access', 'finance-docs']); // base first
  });

  it('rejects unsatisfiable dependency ranges', () => {
    store.publish(bundle('app', '1.0.0', { id: 'a', policyCombining: 'deny-overrides', policies: [] }, [{ name: 'missing', range: '>=1.0.0' }]));
    expect(() => store.resolve('app', '1.0.0')).toThrow(BundleError);
  });

  it('rejects dependency cycles', () => {
    store.publish(bundle('a', '1.0.0', { id: 'a', policyCombining: 'deny-overrides', policies: [] }, [{ name: 'b', range: '>=1.0.0' }]));
    store.publish(bundle('b', '1.0.0', { id: 'b', policyCombining: 'deny-overrides', policies: [] }, [{ name: 'a', range: '>=1.0.0' }]));
    expect(() => store.resolve('a', '1.0.0')).toThrow(/cycle/);
  });

  it('verify detects tampered content', () => {
    const b = store.publish(bundle('x', '1.0.0', { id: 'x', policyCombining: 'deny-overrides', policies: [] }));
    expect(store.verify(b)).toBe(true);
    const tampered: PolicyBundle = { ...b, root: { ...b.root, policyCombining: 'permit-overrides' } };
    expect(store.verify(tampered)).toBe(false);
  });

  it('rejects duplicate name+version publishes', () => {
    store.publish(bundle('x', '1.0.0', { id: 'x', policyCombining: 'deny-overrides', policies: [] }));
    expect(() => store.publish(bundle('x', '1.0.0', { id: 'x', policyCombining: 'deny-overrides', policies: [] }))).toThrow(BundleError);
  });

  it('digest is stable for identical content', () => {
    const b1 = bundle('x', '1.0.0', { id: 'x', policyCombining: 'deny-overrides', policies: [] });
    const b2 = bundle('x', '1.0.0', { id: 'x', policyCombining: 'deny-overrides', policies: [] });
    expect(computeDigest(b1)).toBe(computeDigest(b2));
  });

  it('install plan lists dependencies first', () => {
    store.publish(bundle('base', '1.0.0', { id: 'base', policyCombining: 'deny-overrides', policies: [] }));
    store.publish(bundle('mid', '1.0.0', { id: 'mid', policyCombining: 'deny-overrides', policies: [] }, [{ name: 'base', range: '>=1.0.0' }]));
    store.publish(bundle('top', '1.0.0', { id: 'top', policyCombining: 'deny-overrides', policies: [] }, [{ name: 'mid', range: '>=1.0.0' }]));
    const plan = store.installPlan('top');
    expect(plan.map((p) => p.name)).toEqual(['base', 'mid', 'top']);
  });
});
