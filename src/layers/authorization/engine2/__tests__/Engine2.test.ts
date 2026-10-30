/**
 * Tests for authz engine2: ObligationEngine, HierarchyResolver,
 * TemporalAccessControl, BulkAuthorizer.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ObligationEngine } from '../ObligationEngine';
import { HierarchyResolver } from '../HierarchyResolver';
import { TemporalAccessControl, minuteOfDay, inWindow } from '../TemporalAccess';
import { BulkAuthorizer } from '../BulkAuthorizer';
import { PermissionTrie } from '../PermissionTrie';
import { AccessJournal } from '../AccessJournal';
import { PolicyComposer, CompositionError } from '../PolicyComposition';
import {
  InMemoryObligationHandler,
  ManualAuthzClock,
} from '../types';

describe('ObligationEngine', () => {
  let handler: InMemoryObligationHandler;
  let engine: ObligationEngine;

  beforeEach(() => {
    handler = new InMemoryObligationHandler();
    engine = new ObligationEngine(handler, new ManualAuthzClock());
  });

  it('fires obligations matching the decision effect', () => {
    engine.addRule({
      permissionPattern: 'admin:*',
      obligations: [
        { id: 'o1', kind: 'log', on: 'both', params: { level: 'audit' } },
        { id: 'o2', kind: 'notify', on: 'deny', params: { channel: 'secops' } },
      ],
    });
    const allow = engine.evaluate('u1', 'admin:delete', () => true);
    expect(allow.allowed).toBe(true);
    expect(allow.obligations.map((o) => o.id)).toEqual(['o1']);

    const deny = engine.evaluate('u2', 'admin:delete', () => false);
    expect(deny.effect).toBe('deny');
    expect(deny.obligations.map((o) => o.id)).toEqual(['o1', 'o2']);
    // Both executed against the handler
    expect(handler.executed.length).toBe(3);
  });

  it('skips non-matching permission patterns', () => {
    engine.addRule({
      permissionPattern: 'admin:*',
      obligations: [{ id: 'o1', kind: 'log' }],
    });
    const d = engine.evaluate('u1', 'doc:read', () => true);
    expect(d.obligations.length).toBe(0);
    expect(handler.executed.length).toBe(0);
  });

  it('requireMfa downgrades allow when MFA unproven', () => {
    engine.addRule({
      permissionPattern: 'vault:*',
      obligations: [{ id: 'mfa', kind: 'requireMfa', on: 'allow' }],
    });
    const gated = engine.evaluate('u', 'vault:open', () => true, { mfa: false });
    expect(gated.allowed).toBe(false);
    expect(gated.mfaRequired).toBe(true);

    const ok = engine.evaluate('u', 'vault:open', () => true, { mfa: true });
    expect(ok.allowed).toBe(true);
    expect(ok.mfaRequired).toBe(false);
  });

  it('works without a handler (obligations returned, not executed)', () => {
    const bare = new ObligationEngine();
    bare.addRule({ permissionPattern: '*', obligations: [{ id: 'x', kind: 'log' }] });
    const d = bare.evaluate('s', 'a:b', () => true);
    expect(d.obligations.length).toBe(1);
  });
});

describe('HierarchyResolver', () => {
  let h: HierarchyResolver;

  beforeEach(() => {
    h = new HierarchyResolver();
    // folder:root → folder:eng → doc:42
    h.setNode({ resourceId: 'folder:eng', parentId: 'folder:root' });
    h.setNode({ resourceId: 'doc:42', parentId: 'folder:eng' });
    h.setNode({ resourceId: 'doc:secret', parentId: 'folder:eng' });
  });

  it('inherits grants down the hierarchy', () => {
    h.grant({ resourceId: 'folder:root', principal: 'alice', permissions: ['read'] });
    const c = h.check('alice', 'doc:42', 'read');
    expect(c.allowed).toBe(true);
    expect(c.decidedAt).toBe('folder:root');
    expect(c.path).toEqual(['doc:42', 'folder:eng', 'folder:root']);
  });

  it('deny on a descendant overrides ancestor allow', () => {
    h.grant({ resourceId: 'folder:root', principal: 'alice', permissions: ['read', 'write'] });
    h.grant({ resourceId: 'doc:secret', principal: 'alice', permissions: ['write'], effect: 'deny' });
    expect(h.check('alice', 'doc:secret', 'read').allowed).toBe(true);
    expect(h.check('alice', 'doc:secret', 'write').allowed).toBe(false);
  });

  it('wildcard principal grants apply to everyone', () => {
    h.grant({ resourceId: 'folder:eng', principal: '*', permissions: ['read'] });
    expect(h.check('stranger', 'doc:42', 'read').allowed).toBe(true);
    expect(h.check('stranger', 'doc:42', 'write').allowed).toBe(false);
  });

  it('no grant → deny', () => {
    expect(h.check('bob', 'doc:42', 'read').allowed).toBe(false);
  });

  it('handles cycles without hanging', () => {
    h.setNode({ resourceId: 'a', parentId: 'b' });
    h.setNode({ resourceId: 'b', parentId: 'a' });
    h.grant({ resourceId: 'a', principal: 'u', permissions: ['x'] });
    expect(h.check('u', 'b', 'x').allowed).toBe(true);
    expect(h.check('u', 'a', 'x').allowed).toBe(true);
  });

  it('effectivePermissions aggregates inherited allows minus denies', () => {
    h.grant({ resourceId: 'folder:root', principal: 'alice', permissions: ['read', 'write', 'exec'] });
    h.grant({ resourceId: 'folder:eng', principal: 'alice', permissions: ['exec'], effect: 'deny' });
    const eff = h.effectivePermissions('alice', 'doc:42');
    expect(eff.has('read')).toBe(true);
    expect(eff.has('write')).toBe(true);
    expect(eff.has('exec')).toBe(false);
  });
});

describe('TemporalAccessControl', () => {
  let clock: ManualAuthzClock;
  let tac: TemporalAccessControl;

  beforeEach(() => {
    // Day-0 10:00 UTC = 10*60*60_000 ms
    clock = new ManualAuthzClock(10 * 3_600_000);
    tac = new TemporalAccessControl(clock);
  });

  it('minuteOfDay computes UTC minute', () => {
    expect(minuteOfDay(10 * 3_600_000)).toBe(600);
    expect(minuteOfDay(0)).toBe(0);
  });

  it('inWindow handles normal and overnight windows', () => {
    expect(inWindow(600, 540, 1020)).toBe(true); // 10:00 in 9–17
    expect(inWindow(300, 540, 1020)).toBe(false); // 5:00 outside
    expect(inWindow(23 * 60, 22 * 60, 6 * 60)).toBe(true); // overnight
    expect(inWindow(2 * 60, 22 * 60, 6 * 60)).toBe(true); // past midnight
    expect(inWindow(12 * 60, 22 * 60, 6 * 60)).toBe(false); // noon outside
    expect(inWindow(100, 100, 100)).toBe(false); // empty
  });

  it('allows access inside a daily window only', () => {
    tac.addWindow({
      id: 'w1',
      subjectId: 'analyst',
      permission: 'prod:read',
      startMinuteOfDay: 9 * 60,
      endMinuteOfDay: 17 * 60,
    });
    expect(tac.isAllowed('analyst', 'prod:read')).toBe(true);
    clock.set(18 * 3_600_000); // 18:00
    expect(tac.isAllowed('analyst', 'prod:read')).toBe(false);
    expect(tac.inAccessWindow('analyst', 'prod:read')).toBe(false);
  });

  it('respects window validity bounds', () => {
    tac.addWindow({
      id: 'w2',
      subjectId: 'u',
      permission: 'x:y',
      startMinuteOfDay: 0,
      endMinuteOfDay: 1439,
      validUntilMs: clock.now() + 1000,
    });
    expect(tac.isAllowed('u', 'x:y')).toBe(true);
    clock.advance(2000);
    expect(tac.isAllowed('u', 'x:y')).toBe(false);
  });

  it('temporary grants work until expiry', () => {
    tac.grantTemporary('oncall', 'prod:write', 3600_000, 'admin', 'incident-7');
    expect(tac.hasActiveGrant('oncall', 'prod:write')).toBe(true);
    clock.advance(3600_001);
    expect(tac.hasActiveGrant('oncall', 'prod:write')).toBe(false);
    expect(tac.activeGrants('oncall').length).toBe(0);
  });

  it('wildcard grants cover any permission', () => {
    tac.grantTemporary('root', '*', 1000);
    expect(tac.hasActiveGrant('root', 'anything:at:all')).toBe(true);
  });

  it('sweep prunes expired grants', () => {
    tac.grantTemporary('a', 'x', 500);
    tac.grantTemporary('b', 'y', 10_000);
    clock.advance(600);
    expect(tac.sweep()).toBe(1);
    expect(tac.sweep()).toBe(0);
  });

  it('window OR grant suffices', () => {
    tac.grantTemporary('u', 'night:read', 5000);
    expect(tac.isAllowed('u', 'night:read')).toBe(true);
  });
});

describe('BulkAuthorizer', () => {
  const perms = new Set(['doc:read', 'doc:write', 'img:view']);
  const checker = (s: string, p: string) => s === 'alice' && perms.has(p);

  it('checks all permissions and returns a map', () => {
    const bulk = new BulkAuthorizer(checker);
    const res = bulk.check({ subjectId: 'alice', permissions: ['doc:read', 'doc:write', 'img:view', 'img:delete'] });
    expect(res.results).toEqual({
      'doc:read': true,
      'doc:write': true,
      'img:view': true,
      'img:delete': false,
    });
    expect(bulk.checkCallCount).toBe(4);
  });

  it('oracle short-circuits prefix groups', () => {
    // Alice can't touch `img:*` at all — oracle answers false for img.
    const oracle = (_s: string, prefix: string) => (prefix === 'img' ? false : undefined);
    const bulk = new BulkAuthorizer(checker, { oracle });
    const res = bulk.check({
      subjectId: 'alice',
      permissions: ['doc:read', 'doc:write', 'img:view', 'img:delete'],
    });
    expect(res.results['img:view']).toBe(false);
    expect(res.results['img:delete']).toBe(false);
    expect(res.shortCircuited).toEqual(['img:view', 'img:delete']);
    // 2 real checks (doc:read, doc:write) instead of 4
    expect(bulk.checkCallCount).toBe(2);
  });

  it('oracle undefined → falls back to per-permission checks', () => {
    const bulk = new BulkAuthorizer(checker, { oracle: () => undefined });
    const res = bulk.check({ subjectId: 'alice', permissions: ['doc:read', 'doc:write'] });
    expect(res.results['doc:read']).toBe(true);
    expect(bulk.checkCallCount).toBe(2);
  });

  it('dedupes repeated permissions', () => {
    const bulk = new BulkAuthorizer(checker);
    const res = bulk.check({ subjectId: 'alice', permissions: ['doc:read', 'doc:read', 'doc:read'] });
    expect(Object.keys(res.results)).toEqual(['doc:read']);
    expect(bulk.checkCallCount).toBe(1);
  });

  it('chunked variant yields results per chunk', () => {
    const bulk = new BulkAuthorizer(checker);
    const many = Array.from({ length: 5 }, (_, i) => `p${i}:x`);
    const chunks = [...bulk.checkChunked({ subjectId: 'bob', permissions: many }, 3)];
    expect(chunks.length).toBe(2);
    expect(Object.keys(chunks[0].results).length).toBe(3);
    expect(Object.keys(chunks[1].results).length).toBe(2);
  });

  it('trie integrates as a fast matcher for bulk checks', () => {
    const trie = new PermissionTrie();
    trie.add('doc:read');
    trie.add('doc:*');
    const bulk = new BulkAuthorizer((s, p) => s === 'u' && trie.matches(p));
    const res = bulk.check({ subjectId: 'u', permissions: ['doc:write', 'img:view'] });
    expect(res.results['doc:write']).toBe(true); // doc:* wildcard
    expect(res.results['img:view']).toBe(false);
  });
});

describe('PermissionTrie', () => {
  let trie: PermissionTrie;

  beforeEach(() => {
    trie = new PermissionTrie();
  });

  it('matches literal permissions in O(segments)', () => {
    trie.add('doc:read:public');
    trie.add('doc:write:internal');
    expect(trie.matches('doc:read:public')).toBe(true);
    expect(trie.matches('doc:read:internal')).toBe(false);
    expect(trie.matches('doc:read')).toBe(false); // segment count differs
  });

  it('wildcard segments match any value', () => {
    trie.add('doc:*:public');
    expect(trie.matches('doc:read:public')).toBe(true);
    expect(trie.matches('doc:write:public')).toBe(true);
    expect(trie.matches('doc:read:private')).toBe(false);
  });

  it('expand lists permissions under a prefix', () => {
    trie.add('doc:read');
    trie.add('doc:write');
    trie.add('img:view');
    expect(trie.expand('doc').sort()).toEqual(['doc:read', 'doc:write']);
    expect(trie.expand('img')).toEqual(['img:view']);
    expect(trie.expand('nonexistent')).toEqual([]);
    expect(trie.expand('').sort()).toEqual(['doc:read', 'doc:write', 'img:view']);
  });

  it('remove deletes and prunes dead nodes', () => {
    trie.add('doc:read');
    trie.add('doc:write');
    const nodesBefore = trie.nodeCount;
    expect(trie.remove('doc:read')).toBe(true);
    expect(trie.matches('doc:read')).toBe(false);
    expect(trie.matches('doc:write')).toBe(true);
    expect(trie.nodeCount).toBeLessThan(nodesBefore);
    expect(trie.remove('doc:read')).toBe(false);
  });

  it('matchesAll checks a batch sharing prefix descent', () => {
    trie.add('a:x');
    trie.add('a:y');
    const res = trie.matchesAll(['a:x', 'a:y', 'a:z', 'b:x']);
    expect(res.get('a:x')).toBe(true);
    expect(res.get('a:y')).toBe(true);
    expect(res.get('a:z')).toBe(false);
    expect(res.get('b:x')).toBe(false);
  });

  it('shares nodes across common prefixes', () => {
    trie.add('shared:path:one');
    const before = trie.nodeCount;
    trie.add('shared:path:two');
    // Only one new leaf node — `shared` and `path` nodes are reused.
    expect(trie.nodeCount).toBe(before + 1);
  });

  it('handles idempotent adds', () => {
    trie.add('x:y');
    trie.add('x:y');
    expect(trie.size).toBe(1);
  });
});

describe('AccessJournal', () => {
  let clock: ManualAuthzClock;
  let journal: AccessJournal;

  beforeEach(() => {
    clock = new ManualAuthzClock(0);
    journal = new AccessJournal(clock);
  });

  it('records decisions with obligations and mfa flag', () => {
    journal.record('u1', 'admin:delete', false, [], false);
    journal.record('u1', 'doc:read', true, [{ id: 'o1', kind: 'log', decisionEffect: 'allow', subjectId: 'u1', permission: 'doc:read' }], false);
    journal.record('u2', 'vault:open', false, [], true);
    expect(journal.size).toBe(3);
    const evs = journal.query({ subjectId: 'u1' });
    expect(evs.length).toBe(2);
    expect(evs[1].obligationIds).toEqual(['o1']);
  });

  it('queries by permission pattern via prefix index', () => {
    journal.record('u', 'admin:a', true, [], false);
    journal.record('u', 'admin:b', false, [], false);
    journal.record('u', 'doc:x', true, [], false);
    const admins = journal.query({ permissionPattern: 'admin:*' });
    expect(admins.length).toBe(2);
    const denied = journal.query({ permissionPattern: 'admin:*', allowed: false });
    expect(denied.length).toBe(1);
    expect(denied[0].permission).toBe('admin:b');
  });

  it('filters by time window', () => {
    journal.record('u', 'x:y', true, [], false);
    clock.advance(1000);
    journal.record('u', 'x:y', true, [], false);
    expect(journal.query({ fromMs: 1000 }).length).toBe(1);
    expect(journal.query({ toMs: 0 }).length).toBe(1);
  });

  it('aggregates stats with denied histogram', () => {
    journal.record('a', 'vault:x', false, [], false);
    journal.record('b', 'vault:x', false, [], false);
    journal.record('c', 'vault:x', false, [], true);
    journal.record('d', 'doc:y', true, [], false);
    const s = journal.stats();
    expect(s.total).toBe(4);
    expect(s.allowed).toBe(1);
    expect(s.denied).toBe(3);
    expect(s.mfaBlocked).toBe(1);
    expect(s.topDenied[0]).toEqual({ permission: 'vault:x', count: 3 });
  });

  it('respects limit', () => {
    for (let i = 0; i < 5; i++) journal.record('u', `p:${i}`, true, [], false);
    expect(journal.query({ limit: 2 }).length).toBe(2);
  });
});

describe('PolicyComposer', () => {
  it('deny-overrides: any deny wins', () => {
    const c = new PolicyComposer('deny-overrides');
    const d = c.combine([
      { source: 'rbac', verdict: 'allow' },
      { source: 'hierarchy', verdict: 'deny' },
      { source: 'temporal', verdict: 'na' },
    ]);
    expect(d.allowed).toBe(false);
    expect(d.decisiveSources).toEqual(['hierarchy']);
  });

  it('deny-overrides: allow when only allows apply', () => {
    const c = new PolicyComposer('deny-overrides');
    const d = c.combine([
      { source: 'rbac', verdict: 'allow' },
      { source: 'temporal', verdict: 'na' },
    ]);
    expect(d.allowed).toBe(true);
    expect(d.decisiveSources).toEqual(['rbac']);
  });

  it('deny-overrides: all-NA fails safe to deny', () => {
    const c = new PolicyComposer('deny-overrides');
    const d = c.combine([{ source: 'x', verdict: 'na' }]);
    expect(d.allowed).toBe(false);
  });

  it('permit-overrides: any allow wins', () => {
    const c = new PolicyComposer('permit-overrides');
    const d = c.combine([
      { source: 'a', verdict: 'deny' },
      { source: 'b', verdict: 'allow' },
    ]);
    expect(d.allowed).toBe(true);
    expect(d.decisiveSources).toEqual(['b']);
  });

  it('first-applicable respects source order', () => {
    const c = new PolicyComposer('first-applicable');
    const d = c.combine([
      { source: 's1', verdict: 'na' },
      { source: 's2', verdict: 'deny' },
      { source: 's3', verdict: 'allow' },
    ]);
    expect(d.allowed).toBe(false);
    expect(d.decisiveSources).toEqual(['s2']);
  });

  it('only-one-applicable raises on ambiguity', () => {
    const c = new PolicyComposer('only-one-applicable');
    expect(() =>
      c.combine([
        { source: 'a', verdict: 'allow' },
        { source: 'b', verdict: 'deny' },
      ])
    ).toThrow(CompositionError);
    expect(() => c.combine([{ source: 'a', verdict: 'na' }])).toThrow(CompositionError);
    const d = c.combine([
      { source: 'a', verdict: 'na' },
      { source: 'b', verdict: 'allow' },
    ]);
    expect(d.allowed).toBe(true);
  });
});
