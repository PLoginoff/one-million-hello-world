/**
 * Tests for the policy engine: expression evaluation, targets, combining
 * algorithms, policy sets, versioning, obligations/advice, caching, audit.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  x,
  evaluateExpression,
  evalValue,
  targetMatches,
  normalizeRequest,
  Policy,
  PolicySet,
  PolicyRequest,
  ElementResult,
  ANY_TARGET,
  Target,
} from '../domain/policy-model';
import {
  combine,
  denyOverrides,
  permitOverrides,
  firstApplicable,
  onlyOneApplicable,
  majority,
} from '../strategies/CombiningAlgorithms';
import {
  PolicyDecisionPoint,
  PolicyRepository,
  DecisionCache,
  contextHash,
  AuditRecord,
} from '../implementations/PolicyDecisionPoint';

const req = (r: Partial<PolicyRequest>): PolicyRequest => ({
  subject: {},
  resource: {},
  action: 'read',
  ...r,
});

const nr = (r: Partial<PolicyRequest>) => normalizeRequest(req(r));

describe('Expressions', () => {
  const nreq = nr({
    subject: { id: 'u1', roles: ['admin', 'dev'], clearance: 3 },
    resource: { owner: 'u1', classification: 'secret', tags: ['finance'] },
    action: 'write',
    environment: { hour: 10, ip: '10.0.0.5' },
  });

  it('evaluates literal, attr and apply nodes', () => {
    expect(evaluateExpression(x.lit(true), nreq)).toBe('true');
    expect(evaluateExpression(x.subject('id'), nreq)).toBe('true');
    expect(evaluateExpression(x.eq(x.subject('id'), x.lit('u1')), nreq)).toBe('true');
    expect(evaluateExpression(x.eq(x.subject('id'), x.lit('u2')), nreq)).toBe('false');
  });

  it('tri-state: missing attribute yields indeterminate', () => {
    expect(evaluateExpression(x.gt(x.subject('missing'), x.lit(1)), nreq)).toBe('indeterminate');
    // eq on missing is defined false (not indeterminate).
    expect(evaluateExpression(x.eq(x.subject('missing'), x.lit(1)), nreq)).toBe('false');
    expect(evaluateExpression(x.exists(x.subject('missing')), nreq)).toBe('false');
    expect(evaluateExpression(x.exists(x.subject('id')), nreq)).toBe('true');
  });

  it('boolean connectives propagate indeterminate correctly', () => {
    const missing = x.gt(x.subject('missing'), x.lit(0));
    // false AND missing → false dominates? Our impl: 'and' returns false
    // immediately on false child, so result is false.
    expect(evaluateExpression(x.and(x.lit(false), missing), nreq)).toBe('false');
    // true AND missing → indeterminate.
    expect(evaluateExpression(x.and(x.lit(true), missing), nreq)).toBe('indeterminate');
    // true OR missing → true.
    expect(evaluateExpression(x.or(x.lit(true), missing), nreq)).toBe('true');
    // NOT missing → indeterminate.
    expect(evaluateExpression(x.not(missing), nreq)).toBe('indeterminate');
  });

  it('membership helpers anyOf / allOf / in / contains', () => {
    expect(evaluateExpression(x.anyOf(x.lit('admin'), x.subject('roles')), nreq)).toBe('true');
    expect(evaluateExpression(x.allOf(x.subject('roles'), x.lit(['admin'])), nreq)).toBe('true');
    expect(evaluateExpression(x.allOf(x.subject('roles'), x.lit(['admin', 'ops'])), nreq)).toBe('false');
    expect(evaluateExpression(x.in(x.lit('secret'), x.lit(['public', 'secret'])), nreq)).toBe('true');
    expect(evaluateExpression(x.contains(x.subject('roles'), x.lit('dev')), nreq)).toBe('true');
  });

  it('string functions and comparisons', () => {
    expect(evaluateExpression(x.matches(x.env('ip'), x.lit('/^10\\./')), nreq)).toBe('true');
    expect(evaluateExpression(x.gte(x.subject('clearance'), x.lit(3)), nreq)).toBe('true');
    expect(evaluateExpression(x.lt(x.env('hour'), x.lit(18)), nreq)).toBe('true');
    expect(evalValue(x.action('id'), nreq)).toBe('write');
  });
});

describe('Targets', () => {
  const nreq = nr({ subject: { dept: 'eng' }, resource: { type: 'doc' }, action: 'read' });

  it('empty target matches everything', () => {
    expect(targetMatches(ANY_TARGET, nreq)).toBe(true);
  });

  it('allOf conjunction', () => {
    const t: Target = {
      allOf: [
        { category: 'resource', path: 'type', op: 'eq', value: 'doc' },
        { category: 'action', path: 'id', op: 'in', value: ['read', 'list'] },
      ],
    };
    expect(targetMatches(t, nreq)).toBe(true);
    const t2: Target = {
      allOf: [{ category: 'action', path: 'id', op: 'eq', value: 'write' }],
    };
    expect(targetMatches(t2, nreq)).toBe(false);
  });

  it('anyOf disjunction of conjunction groups', () => {
    const t: Target = {
      anyOf: [
        [{ category: 'subject', path: 'dept', op: 'eq', value: 'sales' }],
        [
          { category: 'subject', path: 'dept', op: 'eq', value: 'eng' },
          { category: 'action', path: 'id', op: 'eq', value: 'read' },
        ],
      ],
    };
    expect(targetMatches(t, nreq)).toBe(true);
  });
});

describe('Combining algorithms', () => {
  const result = (effect: 'permit' | 'deny' | 'notApplicable' | 'indeterminate', ruleId = 'r'): ElementResult => ({
    decision: { effect, obligations: [], advice: [], decidingPolicyIds: ['p'], decidingRuleIds: [ruleId] },
    obligations: effect === 'deny' || effect === 'permit' ? [{ id: `${effect}-obl` }] : [],
    advice: [],
  });

  it('deny-overrides: any deny wins over permits', () => {
    const d = denyOverrides([result('permit', 'r1'), result('deny', 'r2'), result('permit', 'r3')], false);
    expect(d.effect).toBe('deny');
    expect(d.decidingRuleIds).toEqual(['r2']);
    expect(d.obligations.map((o) => o.id)).toEqual(['deny-obl']);
  });

  it('permit-overrides: any permit wins over denies', () => {
    const d = permitOverrides([result('deny', 'r1'), result('permit', 'r2')], false);
    expect(d.effect).toBe('permit');
  });

  it('deny-overrides: all n/a → notApplicable; indeterminate bubbles', () => {
    expect(denyOverrides([result('notApplicable')], false).effect).toBe('notApplicable');
    expect(denyOverrides([result('notApplicable'), result('indeterminate')], false).effect).toBe('indeterminate');
    // deny still wins over indeterminate
    expect(denyOverrides([result('indeterminate'), result('deny')], false).effect).toBe('deny');
  });

  it('first-applicable returns first decided result in order', () => {
    const d = firstApplicable([result('notApplicable'), result('permit', 'r2'), result('deny', 'r3')]);
    expect(d.effect).toBe('permit');
    expect(d.decidingRuleIds).toEqual(['r2']);
    // indeterminate counts as applicable
    expect(firstApplicable([result('notApplicable'), result('indeterminate'), result('permit')]).effect).toBe('indeterminate');
    expect(firstApplicable([result('notApplicable')]).effect).toBe('notApplicable');
  });

  it('only-one-applicable: multiple applicable → indeterminate', () => {
    expect(onlyOneApplicable([result('permit', 'a'), result('deny', 'b')]).effect).toBe('indeterminate');
    expect(onlyOneApplicable([result('notApplicable'), result('permit', 'a')]).effect).toBe('permit');
    expect(onlyOneApplicable([result('notApplicable')]).effect).toBe('notApplicable');
  });

  it('majority: strict majority wins; ties configurable', () => {
    expect(majority([result('permit'), result('permit'), result('deny')], 'notApplicable').effect).toBe('permit');
    expect(majority([result('deny'), result('deny'), result('permit')], 'notApplicable').effect).toBe('deny');
    expect(majority([result('permit'), result('deny')], 'notApplicable').effect).toBe('notApplicable');
    expect(majority([result('permit'), result('deny')], 'deny').effect).toBe('deny');
    expect(majority([result('permit'), result('deny')], 'indeterminate').effect).toBe('indeterminate');
    expect(majority([result('notApplicable')], 'notApplicable').effect).toBe('notApplicable');
  });

  it('combine dispatches on algorithm name', () => {
    expect(combine('deny-overrides', [result('permit'), result('deny')]).effect).toBe('deny');
    expect(combine('permit-overrides', [result('permit'), result('deny')]).effect).toBe('permit');
  });
});

describe('PolicyDecisionPoint', () => {
  let pdp: PolicyDecisionPoint;
  let audits: AuditRecord[];

  const docPolicy: Policy = {
    id: 'doc-access',
    target: { allOf: [{ category: 'resource', path: 'type', op: 'eq', value: 'doc' }] },
    ruleCombining: 'deny-overrides',
    rules: [
      {
        id: 'deny-secret-non-owner',
        effect: 'deny',
        condition: x.and(
          x.eq(x.resource('classification'), x.lit('secret')),
          x.apply('neq', x.subject('id'), x.resource('owner'))
        ),
        obligations: [{ id: 'log-deny', attributes: { reason: 'secret doc' } }],
      },
      {
        id: 'permit-owner',
        effect: 'permit',
        condition: x.eq(x.subject('id'), x.resource('owner')),
      },
      {
        id: 'permit-dept',
        effect: 'permit',
        condition: x.and(
          x.eq(x.action('id'), x.lit('read')),
          x.eq(x.subject('dept'), x.resource('dept'))
        ),
      },
    ],
  };

  beforeEach(() => {
    audits = [];
    pdp = new PolicyDecisionPoint({ clock: (() => { let t = 0; return () => ++t; })(), audit: (r) => audits.push(r) });
    pdp.deploy(docPolicy, { storedBy: 'tester', comment: 'initial' });
  });

  it('permits owner reading own doc', async () => {
    const d = await pdp.evaluate('doc-access', req({
      subject: { id: 'u1', dept: 'eng' },
      resource: { type: 'doc', owner: 'u1', classification: 'secret', dept: 'eng' },
      action: 'read',
    }));
    expect(d.effect).toBe('permit');
    expect(d.decidingRuleIds).toContain('permit-owner');
  });

  it('denies non-owner reading secret doc + attaches obligation', async () => {
    const d = await pdp.evaluate('doc-access', req({
      subject: { id: 'u2', dept: 'eng' },
      resource: { type: 'doc', owner: 'u1', classification: 'secret', dept: 'eng' },
      action: 'read',
    }));
    expect(d.effect).toBe('deny');
    expect(d.decidingRuleIds).toContain('deny-secret-non-owner');
    expect(d.obligations.map((o) => o.id)).toContain('log-deny');
  });

  it('permits same-dept read on non-secret doc via third rule', async () => {
    const d = await pdp.evaluate('doc-access', req({
      subject: { id: 'u2', dept: 'eng' },
      resource: { type: 'doc', owner: 'u1', classification: 'internal', dept: 'eng' },
      action: 'read',
    }));
    expect(d.effect).toBe('permit');
    expect(d.decidingRuleIds).toEqual(['permit-dept']);
  });

  it('notApplicable when policy target misses', async () => {
    const d = await pdp.evaluate('doc-access', req({
      resource: { type: 'server' },
      action: 'reboot',
    }));
    expect(d.effect).toBe('notApplicable');
  });

  it('indeterminate when a matched rule condition hits a missing attribute', async () => {
    const p: Policy = {
      id: 'fragile',
      ruleCombining: 'deny-overrides',
      rules: [
        { id: 'r', effect: 'deny', condition: x.gt(x.subject('clearance'), x.lit(3)) },
      ],
    };
    pdp.deploy(p);
    const d = await pdp.evaluate('fragile', req({ subject: {} }));
    expect(d.effect).toBe('indeterminate');
  });

  it('unknown policy → indeterminate', async () => {
    const d = await pdp.evaluate('nope', req({}));
    expect(d.effect).toBe('indeterminate');
    expect(d.reason).toContain('not found');
  });

  it('policy sets combine child policies with their own targets', async () => {
    const writeSet: PolicySet = {
      id: 'doc-set',
      target: { allOf: [{ category: 'resource', path: 'type', op: 'eq', value: 'doc' }] },
      policyCombining: 'deny-overrides',
      policies: [
        {
          id: 'deny-writes-after-hours',
          ruleCombining: 'first-applicable',
          target: { allOf: [{ category: 'action', path: 'id', op: 'eq', value: 'write' }] },
          rules: [
            {
              id: 'no-night-writes',
              effect: 'deny',
              condition: x.or(x.lt(x.env('hour'), x.lit(8)), x.gt(x.env('hour'), x.lit(18))),
              advice: [{ id: 'business-hours-only' }],
            },
          ],
        },
        docPolicy,
      ],
    };
    pdp.deploy(writeSet);
    const d = await pdp.evaluate('doc-set', req({
      subject: { id: 'u1' },
      resource: { type: 'doc', owner: 'u1', classification: 'public' },
      action: 'write',
      environment: { hour: 23 },
    }));
    expect(d.effect).toBe('deny');
    expect(d.advice.map((a) => a.id)).toContain('business-hours-only');
  });

  it('versioning: pinned version uses old rules after redeploy', async () => {
    const v1 = await pdp.evaluate('doc-access', req({
      subject: { id: 'u2', dept: 'eng' },
      resource: { type: 'doc', owner: 'u1', classification: 'internal', dept: 'eng' },
      action: 'read',
    }));
    expect(v1.effect).toBe('permit');

    // v2 removes the dept-permit rule.
    const v2Policy: Policy = { ...docPolicy, rules: docPolicy.rules.slice(0, 2) };
    pdp.deploy(v2Policy, { version: 'v2' });

    const latest = await pdp.evaluate('doc-access', req({
      subject: { id: 'u2', dept: 'eng' },
      resource: { type: 'doc', owner: 'u1', classification: 'internal', dept: 'eng' },
      action: 'read',
    }));
    expect(latest.effect).toBe('notApplicable');

    const pinned = await pdp.evaluate('doc-access', req({
      subject: { id: 'u2', dept: 'eng' },
      resource: { type: 'doc', owner: 'u1', classification: 'internal', dept: 'eng' },
      action: 'read',
    }), { version: 'v1' });
    expect(pinned.effect).toBe('permit');

    expect(pdp.repository.versions('doc-access').map((v) => v.version)).toEqual(['v1', 'v2']);
  });

  it('decision caching: second identical request is a cache hit, audit marks cached', async () => {
    const r = req({
      subject: { id: 'u1' },
      resource: { type: 'doc', owner: 'u1', classification: 'public' },
      action: 'read',
    });
    await pdp.evaluate('doc-access', r);
    await pdp.evaluate('doc-access', r);
    const stats = pdp.cacheStats();
    expect(stats.hits).toBe(1);
    expect(audits.length).toBe(2);
    expect(audits[0].cached).toBe(false);
    expect(audits[1].cached).toBe(true);
  });

  it('cache invalidated on redeploy; indeterminate never cached', async () => {
    const r = req({ subject: { id: 'u1' }, resource: { type: 'doc', owner: 'u1' }, action: 'read' });
    await pdp.evaluate('doc-access', r);
    pdp.deploy({ ...docPolicy, rules: [] }); // new version → cache cleared
    expect(pdp.cacheStats().size).toBe(0);

    const frag: Policy = {
      id: 'frag2',
      ruleCombining: 'deny-overrides',
      rules: [{ id: 'x', effect: 'permit', condition: x.gt(x.subject('zzz'), x.lit(1)) }],
    };
    pdp.deploy(frag);
    await pdp.evaluate('frag2', req({}));
    await pdp.evaluate('frag2', req({}));
    expect(pdp.cacheStats().hits).toBe(0); // nothing cached
  });

  it('contextHash is key-order independent', () => {
    expect(contextHash({ a: 1, b: { x: 1, y: 2 } })).toBe(contextHash({ b: { y: 2, x: 1 }, a: 1 }));
    expect(contextHash({ a: 1 })).not.toBe(contextHash({ a: 2 }));
  });

  it('DecisionCache evicts LRU beyond capacity', () => {
    const cache = new DecisionCache(2);
    const d = { effect: 'permit' as const, obligations: [], advice: [], decidingPolicyIds: [], decidingRuleIds: [] };
    cache.set('a', d);
    cache.set('b', d);
    cache.get('a'); // touch a → b is now LRU
    cache.set('c', d);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBeDefined();
    expect(cache.get('c')).toBeDefined();
  });

  it('PolicyRepository keeps append-only history', () => {
    const repo = new PolicyRepository();
    repo.put(docPolicy, { comment: 'first' });
    repo.put({ ...docPolicy, rules: [] }, { comment: 'second' });
    const hist = repo.history();
    expect(hist.length).toBe(2);
    expect(hist[0].entry.comment).toBe('first');
    expect(repo.get('doc-access')?.policy.rules.length).toBe(0);
    expect(() => repo.put(docPolicy, { version: 'v1' })).toThrow();
  });
});
