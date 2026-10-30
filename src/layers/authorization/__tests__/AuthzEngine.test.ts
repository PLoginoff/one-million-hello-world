/**
 * Authorization engine tests: permission matching, RBAC hierarchy,
 * ABAC policies, deny-overrides, caching, ownership, delegation, diffs.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  permissionMatches,
  diffPermissions,
  RbacResolver,
} from '../engine/RbacResolver';
import { evaluateCondition, AbacEvaluator } from '../engine/AbacEvaluator';
import { DecisionCache, environmentFingerprint } from '../engine/DecisionCache';
import { DelegationRegistry } from '../engine/DelegationRegistry';
import { AuthzEngine } from '../engine/AuthzEngine';
import type {
  AccessRequest,
  AuthzClock,
  Resource,
  Role,
  Subject,
} from '../engine/types';

class FakeClock implements AuthzClock {
  t = 1_000_000;
  now(): number {
    return this.t;
  }
  advance(ms: number): void {
    this.t += ms;
  }
}

const doc = (attrs?: Record<string, unknown>, ownerId?: string): Resource => ({
  id: 'doc1',
  type: 'document',
  ownerId,
  attributes: attrs,
});

const req = (subject: Subject, resource: Resource, action: string, env?: Record<string, unknown>): AccessRequest => ({
  subject,
  resource,
  action,
  environment: env,
});

describe('permissionMatches', () => {
  it('matches literals and wildcards', () => {
    expect(permissionMatches('doc:read', 'doc:read')).toBe(true);
    expect(permissionMatches('doc:*', 'doc:read')).toBe(true);
    expect(permissionMatches('doc:*', 'doc:read:all')).toBe(true);
    expect(permissionMatches('*', 'anything:here')).toBe(true);
    expect(permissionMatches('*:read', 'doc:read')).toBe(true);
    expect(permissionMatches('doc:read', 'doc:read:all')).toBe(false);
    expect(permissionMatches('doc:write', 'doc:read')).toBe(false);
    expect(permissionMatches('a:*:c', 'a:b:c')).toBe(true);
    expect(permissionMatches('a:*:c', 'a:b:d')).toBe(false);
  });
});

describe('diffPermissions', () => {
  it('reports added/removed/unchanged', () => {
    const d = diffPermissions(['a', 'b'], ['b', 'c']);
    expect(d.added).toEqual(['c']);
    expect(d.removed).toEqual(['a']);
    expect(d.unchanged).toEqual(['b']);
  });
});

describe('RbacResolver', () => {
  let r: RbacResolver;
  const role = (id: string, permissions: string[], inherits: string[] = []): Role => ({
    id,
    name: id,
    permissions,
    inherits,
  });

  beforeEach(() => {
    r = new RbacResolver();
  });

  it('resolves direct permissions', () => {
    r.registerRole(role('reader', ['doc:read']));
    expect([...r.resolveRole('reader')]).toEqual(['doc:read']);
  });

  it('resolves transitive inheritance', () => {
    r.registerRole(role('base', ['doc:read']));
    r.registerRole(role('editor', ['doc:write'], ['base']));
    r.registerRole(role('admin', ['doc:delete'], ['editor']));
    const perms = r.resolveRole('admin');
    expect(perms.has('doc:read')).toBe(true);
    expect(perms.has('doc:write')).toBe(true);
    expect(perms.has('doc:delete')).toBe(true);
  });

  it('tolerates inheritance cycles', () => {
    r.registerRole(role('a', ['p:1'], ['b']));
    r.registerRole(role('b', ['p:2'], ['a']));
    const perms = r.resolveRole('a');
    expect(perms.has('p:1')).toBe(true);
    expect(perms.has('p:2')).toBe(true);
    expect(r.findCycle()).toBeDefined();
  });

  it('resolves subject grants separately from roles', () => {
    r.registerRole(role('reader', ['doc:read']));
    const s: Subject = {
      id: 'u',
      roles: ['reader'],
      grants: [
        { permission: 'doc:write' },
        { permission: 'doc:delete', effect: 'deny' },
      ],
    };
    const out = r.resolveSubject(s);
    expect(out.allow.has('doc:write')).toBe(true);
    expect(out.deny.has('doc:delete')).toBe(true);
  });

  it('invalidates memoized role resolution after role update', () => {
    r.registerRole(role('x', ['p:1']));
    expect(r.resolveRole('x').has('p:1')).toBe(true);
    r.registerRole(role('x', ['p:2']));
    expect(r.resolveRole('x').has('p:2')).toBe(true);
    expect(r.resolveRole('x').has('p:1')).toBe(false);
  });
});

describe('AbacEvaluator / conditions', () => {
  const subject: Subject = {
    id: 'u1',
    roles: [],
    attributes: { department: 'eng', clearance: 3, tags: ['a', 'b'] },
  };
  const resource: Resource = {
    id: 'd1',
    type: 'document',
    attributes: { classification: 'secret' },
  };
  const base: AccessRequest = {
    subject,
    resource,
    action: 'read',
    environment: { hour: 14, ip: '10.0.0.1' },
  };

  it('evaluates all operators', () => {
    const at = (attr: string) => ({ subject, resource, action: 'x', environment: base.environment });
    void at;
    const t = (cond: Parameters<typeof evaluateCondition>[1]) =>
      evaluateCondition(base, cond);
    expect(t({ attr: 'subject.attributes.department', op: 'eq', value: 'eng' })).toBe(true);
    expect(t({ attr: 'subject.attributes.department', op: 'neq', value: 'hr' })).toBe(true);
    expect(t({ attr: 'subject.attributes.clearance', op: 'gte', value: 3 })).toBe(true);
    expect(t({ attr: 'subject.attributes.clearance', op: 'gt', value: 3 })).toBe(false);
    expect(t({ attr: 'subject.attributes.tags', op: 'contains', value: 'a' })).toBe(true);
    expect(t({ attr: 'subject.attributes.department', op: 'in', value: ['eng', 'ops'] })).toBe(true);
    expect(t({ attr: 'environment.ip', op: 'startsWith', value: '10.' })).toBe(true);
    expect(t({ attr: 'environment.ip', op: 'matches', value: /^10\./ })).toBe(true);
    expect(t({ attr: 'subject.attributes.missing', op: 'exists' })).toBe(false);
    expect(t({ attr: 'subject.attributes.missing', op: 'eq', value: 1 })).toBe(false);
  });

  it('requires all conditions to hold', () => {
    const ev = new AbacEvaluator();
    ev.registerPolicy({
      id: 'p1',
      permissions: ['document:read'],
      conditions: [
        { attr: 'subject.attributes.department', op: 'eq', value: 'eng' },
        { attr: 'resource.attributes.classification', op: 'eq', value: 'secret' },
      ],
    });
    const { allows } = ev.evaluate(base);
    expect(allows.length).toBe(1);
    const noMatch = ev.evaluate({ ...base, environment: { hour: 14 } });
    expect(noMatch.allows.length).toBe(1); // env not referenced
    const badDept = ev.evaluate({
      ...base,
      subject: { ...subject, attributes: { department: 'hr' } },
    });
    expect(badDept.allows.length).toBe(0);
  });
});

describe('DecisionCache', () => {
  it('serves entries within TTL and version', () => {
    const c = new DecisionCache({ ttlMs: 1000 });
    const dec = { allowed: true, effect: 'allow' as const, reasons: [], sources: [] };
    c.set('k', dec, 1, 0);
    expect(c.get('k', 1, 500)?.allowed).toBe(true);
    expect(c.get('k', 2, 500)).toBeUndefined(); // version bump
    expect(c.get('k', 1, 2000)).toBeUndefined(); // expired
  });

  it('evicts LRU at capacity', () => {
    const c = new DecisionCache({ capacity: 2, ttlMs: 10_000 });
    const dec = { allowed: true, effect: 'allow' as const, reasons: [], sources: [] };
    c.set('a', dec, 1, 0);
    c.set('b', dec, 1, 0);
    c.get('a', 1, 1); // touch a
    c.set('c', dec, 1, 2); // evicts b
    expect(c.get('b', 1, 3)).toBeUndefined();
    expect(c.get('a', 1, 3)).toBeDefined();
  });

  it('invalidates by subject and resource', () => {
    const c = new DecisionCache({ ttlMs: 10_000 });
    const dec = { allowed: true, effect: 'allow' as const, reasons: [], sources: [] };
    c.set('u1|r1|read|-', dec, 1, 0);
    c.set('u2|r1|read|-', dec, 1, 0);
    expect(c.invalidateSubject('u1')).toBe(1);
    expect(c.get('u1|r1|read|-', 1, 1)).toBeUndefined();
    expect(c.invalidateResource('r1')).toBe(1);
  });

  it('environmentFingerprint is order-independent', () => {
    expect(environmentFingerprint({ a: 1, b: 2 })).toBe(
      environmentFingerprint({ b: 2, a: 1 })
    );
  });
});

describe('DelegationRegistry', () => {
  let clock: FakeClock;
  let reg: DelegationRegistry;

  beforeEach(() => {
    clock = new FakeClock();
    reg = new DelegationRegistry(clock);
  });

  it('delegates and resolves active permissions', () => {
    reg.delegate({
      grantorId: 'boss',
      delegateId: 'temp',
      permissions: ['doc:read'],
      ttlMs: 5000,
    });
    const out = reg.delegatedPermissions('temp', 'doc:read', 'doc', 'd1');
    expect(out.delegations.length).toBe(1);
    expect(out.permissions).toEqual(['doc:read']);
  });

  it('expires delegations', () => {
    reg.delegate({ grantorId: 'g', delegateId: 'd', permissions: ['x:y'], ttlMs: 100 });
    clock.advance(200);
    expect(reg.activeFor('d', 'x', 'r').length).toBe(0);
    expect(reg.purgeExpired()).toBe(1);
  });

  it('scopes delegation by resource type and id', () => {
    reg.delegate({
      grantorId: 'g',
      delegateId: 'd',
      permissions: ['doc:read'],
      ttlMs: 1000,
      resourceId: 'only-this',
    });
    expect(reg.activeFor('d', 'doc', 'only-this').length).toBe(1);
    expect(reg.activeFor('d', 'doc', 'other').length).toBe(0);
  });

  it('revokes by id', () => {
    const d = reg.delegate({ grantorId: 'g', delegateId: 'x', permissions: ['a:b'], ttlMs: 1000 });
    expect(reg.revoke(d.id)).toBe(true);
    expect(reg.heldBy('x').length).toBe(0);
  });
});

describe('AuthzEngine', () => {
  let clock: FakeClock;
  let engine: AuthzEngine;

  const reader: Role = { id: 'reader', name: 'Reader', permissions: ['document:read'], inherits: [] };
  const editor: Role = {
    id: 'editor',
    name: 'Editor',
    permissions: ['document:write'],
    inherits: ['reader'],
  };

  beforeEach(() => {
    clock = new FakeClock();
    engine = new AuthzEngine({ clock });
    engine.registerRole(reader);
    engine.registerRole(editor);
  });

  it('allows via role permission', () => {
    const s: Subject = { id: 'u', roles: ['reader'] };
    const d = engine.evaluate(req(s, doc(), 'read'));
    expect(d.allowed).toBe(true);
    expect(d.sources).toContain('role');
  });

  it('inherits permissions through role hierarchy', () => {
    const s: Subject = { id: 'u', roles: ['editor'] };
    expect(engine.evaluate(req(s, doc(), 'read')).allowed).toBe(true);
    expect(engine.evaluate(req(s, doc(), 'write')).allowed).toBe(true);
  });

  it('default-denies unmatched', () => {
    const s: Subject = { id: 'u', roles: ['reader'] };
    const d = engine.evaluate(req(s, doc(), 'delete'));
    expect(d.allowed).toBe(false);
    expect(d.sources).toContain('default-deny');
  });

  it('deny grant overrides role allow', () => {
    const s: Subject = {
      id: 'u',
      roles: ['editor'],
      grants: [{ permission: 'document:write', effect: 'deny' }],
    };
    const d = engine.evaluate(req(s, doc(), 'write'));
    expect(d.allowed).toBe(false);
    expect(d.effect).toBe('deny');
  });

  it('ABAC deny policy overrides everything', () => {
    engine.registerPolicy({
      id: 'no-secret-read',
      permissions: ['document:read'],
      effect: 'deny',
      conditions: [
        { attr: 'resource.attributes.classification', op: 'eq', value: 'secret' },
        { attr: 'subject.attributes.clearance', op: 'lt', value: 3 },
      ],
    });
    const low: Subject = { id: 'u', roles: ['reader'], attributes: { clearance: 1 } };
    const high: Subject = { id: 'u2', roles: ['reader'], attributes: { clearance: 5 } };
    const secret = doc({ classification: 'secret' });
    expect(engine.evaluate(req(low, secret, 'read')).allowed).toBe(false);
    expect(engine.evaluate(req(high, secret, 'read')).allowed).toBe(true);
  });

  it('ABAC allow policy grants without roles', () => {
    engine.registerPolicy({
      id: 'public-docs',
      permissions: ['document:read'],
      conditions: [{ attr: 'resource.attributes.public', op: 'eq', value: true }],
    });
    const anon: Subject = { id: 'anon', roles: [] };
    expect(engine.evaluate(req(anon, doc({ public: true }), 'read')).allowed).toBe(true);
    expect(engine.evaluate(req(anon, doc({ public: false }), 'read')).allowed).toBe(false);
  });

  it('grants owners implicit permissions', () => {
    const eng = new AuthzEngine({ clock, ownershipPermissions: ['document:own'] });
    const s: Subject = { id: 'owner1', roles: [] };
    const mine = doc({}, 'owner1');
    const other = doc({}, 'someone-else');
    expect(eng.evaluate(req(s, mine, 'own')).allowed).toBe(true);
    expect(eng.evaluate(req(s, other, 'own')).allowed).toBe(false);
  });

  it('caches decisions and invalidates on graph change', () => {
    const s: Subject = { id: 'u', roles: ['reader'] };
    const r1 = engine.evaluate(req(s, doc(), 'read'));
    const r2 = engine.evaluate(req(s, doc(), 'read'));
    expect(r2.fromCache).toBe(true);
    // Register a policy denying reads -> version bump -> fresh eval
    engine.registerPolicy({
      id: 'deny-all',
      permissions: ['*'],
      effect: 'deny',
      conditions: [{ attr: 'subject.id', op: 'exists' }],
    });
    const r3 = engine.evaluate(req(s, doc(), 'read'));
    expect(r3.allowed).toBe(false);
    expect(r3.fromCache).toBeUndefined();
  });

  it('delegation grants temporary permissions', () => {
    const boss: Subject = { id: 'boss', roles: ['editor'] };
    const temp: Subject = { id: 'temp', roles: [] };
    engine.registerSubject(boss);
    engine.registerSubject(temp);
    engine.delegate({
      grantorId: 'boss',
      delegateId: 'temp',
      permissions: ['document:write'],
      ttlMs: 60_000,
    });
    const d = engine.evaluate(req(temp, doc(), 'write'));
    expect(d.allowed).toBe(true);
    expect(d.sources).toContain('delegation');
    // After expiry, denied
    clock.advance(61_000);
    expect(engine.evaluate(req(temp, doc(), 'write')).allowed).toBe(false);
  });

  it('rejects delegation of permissions the grantor lacks', () => {
    const weak: Subject = { id: 'w', roles: ['reader'] };
    engine.registerSubject(weak);
    expect(() =>
      engine.delegate({
        grantorId: 'w',
        delegateId: 'x',
        permissions: ['document:delete'],
        ttlMs: 1000,
      })
    ).toThrow();
  });

  it('permission diffing between two role sets', () => {
    engine.registerRole({ id: 'old', name: 'old', permissions: ['a:1', 'a:2'], inherits: [] });
    engine.registerRole({ id: 'new', name: 'new', permissions: ['a:2', 'a:3'], inherits: [] });
    const d = engine.diffRoleSets(['old'], ['new']);
    expect(d.added).toEqual(['a:3']);
    expect(d.removed).toEqual(['a:1']);
    expect(d.unchanged).toEqual(['a:2']);
  });

  it('subject permission diff reflects role changes', () => {
    const s1: Subject = { id: 'u', roles: ['reader'] };
    const s2: Subject = { id: 'u', roles: ['editor'] };
    const d = engine.diffSubjects(s1, s2);
    expect(d.added).toEqual(['document:write']);
    expect(d.removed).toEqual([]);
  });

  it('evaluateIds resolves registered entities', () => {
    engine.registerSubject({ id: 'u', roles: ['reader'] });
    engine.registerResource({ id: 'd', type: 'document' });
    expect(engine.evaluateIds('u', 'd', 'read').allowed).toBe(true);
    expect(engine.evaluateIds('nobody', 'd', 'read').allowed).toBe(false);
  });

  it('permittedOn lists permissions for a resource type', () => {
    const s: Subject = { id: 'u', roles: ['editor'] };
    const perms = engine.permittedOn(s, 'document');
    expect(perms.sort()).toEqual(['document:read', 'document:write']);
  });
});
