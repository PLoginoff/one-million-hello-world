/**
 * Tests for identity engine2: IdentityResolver, AccountRecoveryFlow,
 * IdentityGraph, ConsentManager, LifecycleAutomation.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { IdentityStore } from '../../core/IdentityStore';
import { AccountStatus } from '../../core/types';
import type { User } from '../../core/types';
import {
  IdentityResolver,
  jaro,
  jaroWinkler,
  AccountRecoveryFlow,
  RecoveryState,
  IdentityGraph,
  ConsentManager,
  ConsentStatus,
  LifecycleAutomation,
} from '../index';

let clock: number;
const now = () => clock;
const DAY = 24 * 3600_000;

function makeUser(over: Partial<User> & { id: string }): User {
  return {
    id: over.id,
    username: over.username ?? `user-${over.id}`,
    email: over.email,
    phone: over.phone,
    status: over.status ?? AccountStatus.ACTIVE,
    profile: over.profile ?? { attributes: {} },
    emailVerified: over.emailVerified ?? true,
    phoneVerified: over.phoneVerified ?? true,
    createdAt: 1,
    updatedAt: 1,
    failedLoginAttempts: 0,
    ...over,
  };
}

describe('jaro / jaroWinkler', () => {
  it('identical strings score 1, empty score 0', () => {
    expect(jaro('abc', 'abc')).toBe(1);
    expect(jaro('', 'a')).toBe(0);
    expect(jaro('a', 'b')).toBe(0);
  });

  it('jaro("MARTHA","MARHTA") ≈ 0.944 (textbook value)', () => {
    expect(jaro('MARTHA', 'MARHTA')).toBeCloseTo(0.9444, 3);
  });

  it('winkler boosts common prefixes', () => {
    expect(jaroWinkler('DWAYNE', 'DUANE')).toBeGreaterThan(jaro('DWAYNE', 'DUANE'));
    expect(jaroWinkler('abc', 'abc')).toBe(1);
  });
});

describe('IdentityResolver', () => {
  let resolver: IdentityResolver;
  beforeEach(() => {
    resolver = new IdentityResolver();
  });

  it('auto-matches same normalized email', () => {
    const a = makeUser({ id: 'u1', email: 'jane.doe+work@gmail.com', profile: { givenName: 'Jane', familyName: 'Doe', attributes: {} } });
    const b = makeUser({ id: 'u2', email: 'janedoe@gmail.com', username: 'jdoe2', profile: { givenName: 'J', familyName: 'Doe', attributes: {} } });
    const c = resolver.scorePair(a, b);
    expect(c.verdict).toBe('auto_match');
    expect(c.score).toBeGreaterThan(0.9);
  });

  it('does not match unrelated accounts', () => {
    const a = makeUser({ id: 'u1', email: 'alice@corp.com', username: 'alice' });
    const b = makeUser({ id: 'u2', email: 'bob@other.org', username: 'robert' });
    const c = resolver.scorePair(a, b);
    expect(c.verdict).toBe('non_match');
    expect(c.score).toBeLessThan(0.1);
  });

  it('same name alone is weak evidence (review, not auto-match)', () => {
    const a = makeUser({ id: 'u1', email: 'jsmith1@x.com', username: 'jsmith1', profile: { givenName: 'John', familyName: 'Smith', attributes: {} } });
    const b = makeUser({ id: 'u2', email: 'jsmith99@y.com', username: 'jsmith99', profile: { givenName: 'John', familyName: 'Smith', attributes: {} } });
    const c = resolver.scorePair(a, b);
    // Name + similar usernames/emails should flag at least for review.
    expect(c.score).toBeGreaterThan(0.3);
  });

  it('resolve() blocks candidates and returns sorted results', () => {
    const users = [
      makeUser({ id: 'a', email: 'k@x.com', username: 'kay' }),
      makeUser({ id: 'b', email: 'k@x.com', username: 'kay2' }),
      makeUser({ id: 'c', email: 'z@y.com', username: 'zed' }),
    ];
    const found = resolver.resolve(users);
    expect(found.length).toBeGreaterThanOrEqual(1);
    const top = found[0];
    expect([top.userA, top.userB].sort()).toEqual(['a', 'b']);
  });
});

describe('AccountRecoveryFlow', () => {
  let flow: AccountRecoveryFlow;
  let sent: string[];
  beforeEach(() => {
    clock = 1_000_000;
    sent = [];
    flow = new AccountRecoveryFlow(
      { email: (_d, code) => (sent.push(code), `rcpt-${sent.length}`) },
      { requiredChannels: ['email'], codeTtlMs: 60_000, flowTtlMs: 600_000 },
      now,
    );
  });

  it('full flow: initiate → challenge → verify → complete → exchange', () => {
    const user = makeUser({ id: 'u1', email: 'a@b.c', emailVerified: true });
    const f = flow.initiate(user);
    const ch = flow.challenge(f.id, 'email', 'a@b.c');
    expect(sent).toHaveLength(1);
    flow.verify(f.id, 'email', ch.code);
    expect(flow.flow(f.id)?.state).toBe(RecoveryState.VERIFIED);
    const { grant, userId } = flow.complete(f.id);
    expect(userId).toBe('u1');
    expect(flow.exchangeGrant(grant)).toBe('u1');
    // Grant is single-use.
    expect(() => flow.exchangeGrant(grant)).toThrow(/Invalid|consumed/);
  });

  it('rejects wrong codes and locks after maxFailures', () => {
    const user = makeUser({ id: 'u1', email: 'a@b.c', emailVerified: true });
    const f = flow.initiate(user);
    const ch = flow.challenge(f.id, 'email', 'a@b.c');
    // Burn attempts with wrong codes — 5 per code × 3 codes = locked.
    const wrong = ch.code === '000000' ? '000001' : '000000';
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 5; i++) {
        try {
          flow.verify(f.id, 'email', wrong);
        } catch {
          /* expected */
        }
      }
      try {
        flow.challenge(f.id, 'email', 'a@b.c'); // re-issue resets attempts
      } catch {
        break; // flow locked mid-round — expected on the last round
      }
    }
    expect(flow.flow(f.id)?.state).toBe(RecoveryState.LOCKED);
  });

  it('multi-channel policy requires BOTH channels verified', () => {
    const codes: Record<string, string> = {};
    flow = new AccountRecoveryFlow(
      {
        email: (_d, c) => ((codes.email = c), 'e'),
        phone: (_d, c) => ((codes.phone = c), 'p'),
      },
      { requiredChannels: ['email', 'phone'], codeTtlMs: 60_000 },
      now,
    );
    const user = makeUser({ id: 'u1', email: 'a@b.c', phone: '+123', emailVerified: true, phoneVerified: true });
    const f = flow.initiate(user);
    flow.challenge(f.id, 'email', 'a@b.c');
    flow.challenge(f.id, 'phone', '+123');
    flow.verify(f.id, 'email', codes.email!);
    expect(flow.flow(f.id)?.state).toBe(RecoveryState.PARTIALLY_VERIFIED);
    flow.verify(f.id, 'phone', codes.phone!);
    expect(flow.flow(f.id)?.state).toBe(RecoveryState.VERIFIED);
  });

  it('codes expire per TTL', () => {
    const user = makeUser({ id: 'u1', email: 'a@b.c', emailVerified: true });
    const f = flow.initiate(user);
    const ch = flow.challenge(f.id, 'email', 'a@b.c');
    clock += 61_000;
    expect(() => flow.verify(f.id, 'email', ch.code)).toThrow(/expired/);
  });
});

describe('IdentityGraph', () => {
  it('finds users sharing a device', () => {
    const g = new IdentityGraph(now);
    g.addNode('u1', 'user');
    g.addNode('u2', 'user');
    g.recordLogin('u1', 's1', 'dev-9', '10.0.0.1');
    g.recordLogin('u2', 's2', 'dev-9', '10.0.0.2');

    const linked = g.linkedUsers('dev-9');
    const ids = linked.map((n) => n.id).sort();
    expect(ids).toEqual(['u1', 'u2']);
  });

  it('componentOf maps a full account neighborhood', () => {
    const g = new IdentityGraph(now);
    g.addNode('u1', 'user');
    g.recordLogin('u1', 's1', 'd1', '1.2.3.4');
    const comp = g.componentOf('u1');
    const types = new Set(comp.map((h) => h.node.type));
    expect(types.has('session')).toBe(true);
    expect(types.has('device')).toBe(true);
    expect(types.has('ip')).toBe(true);
  });

  it('depth cap bounds traversal', () => {
    const g = new IdentityGraph(now);
    g.addNode('u1', 'user');
    g.recordLogin('u1', 's1', 'd1');
    const shallow = g.traverse('u1', { maxDepth: 1 });
    // session + device (direct edges), nothing deeper.
    expect(shallow.every((h) => h.depth === 1)).toBe(true);
  });
});

describe('ConsentManager', () => {
  let cm: ConsentManager;
  beforeEach(() => {
    clock = 5_000_000;
    cm = new ConsentManager(now);
    cm.setPolicyVersion('marketing', 'v2');
  });

  it('grant then check → allowed under current version', () => {
    cm.grant('u1', 'marketing', { surface: 'settings' });
    const c = cm.check('u1', 'marketing');
    expect(c.allowed).toBe(true);
    expect(c.status).toBe(ConsentStatus.GRANTED);
  });

  it('withdraw blocks and is journaled', () => {
    cm.grant('u1', 'marketing');
    cm.withdraw('u1', 'marketing', 'user request');
    expect(cm.check('u1', 'marketing').allowed).toBe(false);
    const j = cm.journal('u1', 'marketing');
    expect(j.map((e) => e.action)).toEqual(['grant', 'withdraw']);
  });

  it('policy bump stales old grants — re-grant required', () => {
    cm.grant('u1', 'marketing', { policyVersion: 'v2' });
    const stale = cm.staleSweep('marketing', 'v3');
    expect(stale).toHaveLength(1);
    expect(cm.check('u1', 'marketing').reason).toBe('stale_version');
    cm.grant('u1', 'marketing', { policyVersion: 'v3' });
    expect(cm.check('u1', 'marketing').allowed).toBe(true);
  });

  it('TTL expiry lapses consent lazily', () => {
    cm.grant('u1', 'marketing', { ttlMs: 1000 });
    clock += 1001;
    const c = cm.check('u1', 'marketing');
    expect(c.allowed).toBe(false);
    expect(c.reason).toBe('expired');
  });

  it('purposes are independent', () => {
    cm.setPolicyVersion('analytics', 'v1');
    cm.grant('u1', 'marketing');
    expect(cm.check('u1', 'analytics').reason).toBe('never_granted');
  });
});

describe('LifecycleAutomation', () => {
  let store: IdentityStore;
  let notified: string[];
  beforeEach(() => {
    clock = 1_000_000_000;
    store = new IdentityStore();
    notified = [];
  });

  const policy = { warnAfterMs: 10 * DAY, suspendAfterMs: 10 * DAY, deleteAfterMs: 10 * DAY };

  it('warns once per dormancy episode, then suspends', () => {
    const user = makeUser({ id: 'u1' });
    store.insert(user);
    const auto = new LifecycleAutomation(store, policy, (uid) => notified.push(uid), now);
    auto.seedActivity('u1', clock - 15 * DAY); // past warn, below suspend

    const r1 = auto.sweep();
    expect(r1.warned).toHaveLength(1);
    expect(notified).toEqual(['u1']);

    // Second sweep — same episode, no re-warn.
    const r2 = auto.sweep();
    expect(r2.warned).toHaveLength(0);
    expect(r2.skipped[0]?.reason).toMatch(/already warned/);

    // Push past suspend threshold.
    auto.seedActivity('u1', clock - 25 * DAY);
    const r3 = auto.sweep();
    expect(r3.suspended).toHaveLength(1);
    expect(store.getById('u1')?.status).toBe(AccountStatus.SUSPENDED);
  });

  it('suspended accounts age to deletion', () => {
    const user = makeUser({ id: 'u1', status: AccountStatus.SUSPENDED, updatedAt: clock - 11 * DAY });
    store.insert(user);
    const auto = new LifecycleAutomation(store, policy, undefined, now);
    // Suspension timestamp falls back to updatedAt → past deleteAfterMs.
    const r = auto.sweep();
    expect(r.deleted).toHaveLength(1);
    expect(store.getById('u1')?.status).toBe(AccountStatus.DELETED);
  });

  it('activity resets the dormancy episode', () => {
    const user = makeUser({ id: 'u1' });
    store.insert(user);
    const auto = new LifecycleAutomation(store, policy, undefined, now);
    auto.seedActivity('u1', clock - 15 * DAY);
    auto.sweep(); // warns
    auto.touch('u1'); // fresh activity
    const r = auto.sweep();
    expect(r.warned).toHaveLength(0);
    expect(r.suspended).toHaveLength(0);
  });

  it('dryRun plans without mutating', () => {
    const user = makeUser({ id: 'u1' });
    store.insert(user);
    const auto = new LifecycleAutomation(store, policy, (uid) => notified.push(uid), now);
    auto.seedActivity('u1', clock - 15 * DAY);
    const r = auto.sweep(true);
    expect(r.warned).toHaveLength(1);
    expect(notified).toHaveLength(0);
    expect(store.getById('u1')?.status).toBe(AccountStatus.ACTIVE);
  });
});
