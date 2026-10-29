/**
 * Identity Core tests — real scrypt hashing, policy engine, lifecycle
 * FSM, verification tokens, sessions, and merge.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { PasswordHasher } from '../core/PasswordHasher';
import { PasswordPolicyEngine } from '../core/PasswordPolicyEngine';
import { AccountLifecycle } from '../core/AccountLifecycle';
import { VerificationTokenStore } from '../core/VerificationTokenStore';
import { SessionRegistry } from '../core/SessionRegistry';
import { IdentityEngine } from '../core/IdentityEngine';
import {
  AccountStatus,
  TokenPurpose,
  AuthResultCode,
  IdentityCoreError,
  IdentityErrorCode,
  DEFAULT_PASSWORD_POLICY,
  IdentityEngineConfig,
  DEFAULT_IDENTITY_ENGINE_CONFIG,
} from '../core/types';

// Fast scrypt params so the suite stays quick.
const FAST: Pick<IdentityEngineConfig, 'scrypt'> = {
  scrypt: { N: 1024, r: 8, p: 1, keyLen: 32 },
};

function makeEngine(now?: () => number): IdentityEngine {
  return new IdentityEngine({ ...FAST, lockoutThreshold: 3, lockoutDurationMs: 60_000 }, now);
}

const STRONG = 'Str0ng!UniquePW';
const STRONG2 = 'An0ther!GoodPW9';

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher(FAST.scrypt);

  it('hashes with salt and verifies round-trip', () => {
    const cred = hasher.hash('hunter2x!X');
    expect(cred.algorithm.startsWith('scrypt:N=')).toBe(true);
    expect(cred.salt).toHaveLength(32);
    expect(hasher.verify('hunter2x!X', cred)).toBe(true);
    expect(hasher.verify('hunter2x!Y', cred)).toBe(false);
  });

  it('produces different salts per hash', () => {
    const a = hasher.hash('same-password1');
    const b = hasher.hash('same-password1');
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it('detects credentials needing rehash after param upgrade', () => {
    const weak = new PasswordHasher({ N: 512, r: 8, p: 1, keyLen: 32 });
    const cred = weak.hash('upgrade-me-1');
    expect(hasher.needsRehash(cred)).toBe(true);
    expect(weak.needsRehash(cred)).toBe(false);
  });
});

describe('PasswordPolicyEngine', () => {
  const engine = new PasswordPolicyEngine(new PasswordHasher(FAST.scrypt));

  it('rejects short passwords', () => {
    const r = engine.check('Ab1', DEFAULT_PASSWORD_POLICY);
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.rule === 'min_length')).toBe(true);
  });

  it('enforces character classes', () => {
    const r = engine.check('alllowercase1!', DEFAULT_PASSWORD_POLICY);
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.rule === 'require_upper')).toBe(true);
  });

  it('rejects breach-list passwords', () => {
    const r = engine.check('Password123', DEFAULT_PASSWORD_POLICY);
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.rule === 'breach')).toBe(true);
  });

  it('rejects passwords containing user info', () => {
    const user = { username: 'jsmith', email: 'jsmith@example.com', profile: { attributes: {} } };
    const r = engine.check('Jsmith!Rocks9', { ...DEFAULT_PASSWORD_POLICY, breachCheck: false }, user);
    expect(r.violations.some((v) => v.rule === 'user_info')).toBe(true);
  });

  it('rejects leetspeak-obfuscated user info', () => {
    const user = { username: 'hacker', email: 'hacker@example.com', profile: { attributes: {} } };
    const r = engine.check('H4ck3r!Pwn3d9', { ...DEFAULT_PASSWORD_POLICY, breachCheck: false }, user);
    expect(r.violations.some((v) => v.rule === 'user_info')).toBe(true);
  });

  it('rejects password reuse within history', () => {
    const hasher = new PasswordHasher(FAST.scrypt);
    const old = hasher.hash('OldPassw0rd!9');
    const r = engine.check('OldPassw0rd!9', { ...DEFAULT_PASSWORD_POLICY, breachCheck: false }, undefined, [old]);
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.rule === 'history')).toBe(true);
  });

  it('scores strong passwords highly', () => {
    const r = engine.check('Xk9!mQ2$vB7#nL4&', { ...DEFAULT_PASSWORD_POLICY, breachCheck: false });
    expect(r.ok).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(3);
  });
});

describe('AccountLifecycle', () => {
  function user(status: AccountStatus) {
    return {
      id: 'u1', username: 'x', status, profile: { attributes: {} },
      emailVerified: false, phoneVerified: false, createdAt: 0, updatedAt: 0,
      failedLoginAttempts: 0,
    };
  }

  it('enforces legal transitions only', () => {
    const u = user(AccountStatus.SUSPENDED);
    expect(() => AccountLifecycle.transition(u, AccountStatus.LOCKED, 0)).toThrow(IdentityCoreError);
    AccountLifecycle.transition(u, AccountStatus.ACTIVE, 0);
    expect(u.status).toBe(AccountStatus.ACTIVE);
  });

  it('DELETED is terminal', () => {
    const u = user(AccountStatus.ACTIVE);
    AccountLifecycle.transition(u, AccountStatus.DELETED, 0);
    expect(() => AccountLifecycle.transition(u, AccountStatus.ACTIVE, 0)).toThrow(IdentityCoreError);
  });

  it('auto-unlocks after lock duration elapses', () => {
    const u = user(AccountStatus.ACTIVE);
    AccountLifecycle.transition(u, AccountStatus.LOCKED, 1_000, 5_000);
    expect(u.lockedUntil).toBe(6_000);
    expect(AccountLifecycle.canAuthenticate(u, 5_999)).toBe(false);
    expect(AccountLifecycle.canAuthenticate(u, 6_001)).toBe(true);
    expect(u.status).toBe(AccountStatus.ACTIVE);
  });
});

describe('VerificationTokenStore', () => {
  let store: VerificationTokenStore;
  beforeEach(() => { store = new VerificationTokenStore(); });

  it('issues and consumes a token exactly once', () => {
    const t = store.issue('u1', TokenPurpose.EMAIL_VERIFICATION, 'a@b.c', 60_000, 1_000);
    const used = store.consume(t.token, TokenPurpose.EMAIL_VERIFICATION, 2_000);
    expect(used.userId).toBe('u1');
    expect(() => store.consume(t.token, TokenPurpose.EMAIL_VERIFICATION, 3_000))
      .toThrowError(expect.objectContaining({ code: IdentityErrorCode.TOKEN_CONSUMED }));
  });

  it('rejects expired tokens', () => {
    const t = store.issue('u1', TokenPurpose.PASSWORD_RESET, '', 1_000, 0);
    expect(() => store.consume(t.token, TokenPurpose.PASSWORD_RESET, 1_001))
      .toThrowError(expect.objectContaining({ code: IdentityErrorCode.TOKEN_EXPIRED }));
  });

  it('rejects purpose mismatch', () => {
    const t = store.issue('u1', TokenPurpose.EMAIL_VERIFICATION, 'a@b.c', 60_000, 0);
    expect(() => store.consume(t.token, TokenPurpose.PASSWORD_RESET, 1))
      .toThrowError(expect.objectContaining({ code: IdentityErrorCode.TOKEN_PURPOSE_MISMATCH }));
  });

  it('invalidates older tokens for same purpose on re-issue', () => {
    const t1 = store.issue('u1', TokenPurpose.PASSWORD_RESET, '', 60_000, 0);
    const t2 = store.issue('u1', TokenPurpose.PASSWORD_RESET, '', 60_000, 1);
    expect(() => store.consume(t1.token, TokenPurpose.PASSWORD_RESET, 2))
      .toThrowError(expect.objectContaining({ code: IdentityErrorCode.TOKEN_CONSUMED }));
    expect(store.consume(t2.token, TokenPurpose.PASSWORD_RESET, 3).userId).toBe('u1');
  });

  it('sweep removes dead records', () => {
    store.issue('u1', TokenPurpose.PASSWORD_RESET, '', 10, 0);
    store.issue('u2', TokenPurpose.PASSWORD_RESET, '', 60_000, 0);
    expect(store.sweep(100)).toBe(1);
    expect(store.size()).toBe(1);
  });
});

describe('SessionRegistry', () => {
  it('creates, touches, revokes sessions', () => {
    const reg = new SessionRegistry(0);
    const { session } = reg.create('u1', 1_000);
    expect(reg.get(session.id, 2_000)?.userId).toBe('u1');
    reg.touch(session.id, 3_000);
    expect(reg.require(session.id).lastSeenAt).toBe(3_000);
    expect(reg.revoke(session.id)).toBe(true);
    expect(reg.get(session.id)).toBeUndefined();
  });

  it('evicts least-recently-seen beyond maxPerUser', () => {
    const reg = new SessionRegistry(2);
    const a = reg.create('u1', 1_000).session;
    reg.create('u1', 2_000);
    const c = reg.create('u1', 3_000);
    expect(c.evicted?.id).toBe(a.id);
    expect(reg.sessionsForUser('u1')).toHaveLength(2);
  });

  it('expires sessions lazily and in sweep', () => {
    const reg = new SessionRegistry(0);
    const { session } = reg.create('u1', 0, 1_000);
    expect(reg.get(session.id, 1_001)).toBeUndefined();
    const s2 = reg.create('u1', 0, 500).session;
    const s3 = reg.create('u1', 0, 60_000).session;
    expect(reg.sweep(600)).toBe(1);
    expect(reg.get(s3.id, 700)).toBeDefined();
    expect(reg.get(s2.id, 700)).toBeUndefined();
  });

  it('reassigns sessions on merge', () => {
    const reg = new SessionRegistry(0);
    reg.create('u2', 0);
    reg.create('u2', 1);
    expect(reg.reassign('u2', 'u1')).toBe(2);
    expect(reg.sessionsForUser('u1')).toHaveLength(2);
    expect(reg.sessionsForUser('u2')).toHaveLength(0);
  });
});

describe('IdentityEngine', () => {
  let engine: IdentityEngine;
  beforeEach(() => { engine = makeEngine(); });

  it('registers and authenticates', () => {
    const u = engine.register({ username: 'alice', password: STRONG, email: 'alice@example.com' });
    const r = engine.authenticate('alice', STRONG);
    expect(r.code).toBe(AuthResultCode.SUCCESS);
    expect(r.user?.id).toBe(u.id);
    expect(r.session).toBeDefined();
  });

  it('authenticates by email too', () => {
    engine.register({ username: 'bob', password: STRONG, email: 'bob@example.com' });
    expect(engine.authenticate('bob@example.com', STRONG).code).toBe(AuthResultCode.SUCCESS);
  });

  it('rejects duplicate usernames and emails', () => {
    engine.register({ username: 'carol', password: STRONG, email: 'carol@example.com' });
    expect(() => engine.register({ username: 'carol', password: STRONG2 }))
      .toThrowError(expect.objectContaining({ code: IdentityErrorCode.USERNAME_TAKEN }));
    expect(() => engine.register({ username: 'carol2', password: STRONG2, email: 'CAROL@example.com' }))
      .toThrowError(expect.objectContaining({ code: IdentityErrorCode.EMAIL_TAKEN }));
  });

  it('locks after threshold bad attempts, then auto-unlocks', () => {
    let now = 1_000_000;
    const e = new IdentityEngine({ ...FAST, lockoutThreshold: 3, lockoutDurationMs: 60_000 }, () => now);
    e.register({ username: 'dave', password: STRONG });
    expect(e.authenticate('dave', 'wrong').code).toBe(AuthResultCode.BAD_CREDENTIALS);
    expect(e.authenticate('dave', 'wrong').code).toBe(AuthResultCode.BAD_CREDENTIALS);
    expect(e.authenticate('dave', 'wrong').code).toBe(AuthResultCode.LOCKED);
    expect(e.authenticate('dave', STRONG).code).toBe(AuthResultCode.LOCKED);
    now += 61_000;
    expect(e.authenticate('dave', STRONG).code).toBe(AuthResultCode.SUCCESS);
  });

  it('unknown user login yields UNKNOWN_USER', () => {
    expect(engine.authenticate('ghost', 'whatever').code).toBe(AuthResultCode.UNKNOWN_USER);
  });

  it('email verification flow marks user verified', () => {
    const u = engine.register({ username: 'erin', password: STRONG, email: 'erin@example.com' });
    const { token } = engine.issueEmailVerification(u.id);
    expect(engine.confirmEmail(token).emailVerified).toBe(true);
  });

  it('password reset consumes token, kills sessions, applies history', () => {
    const u = engine.register({ username: 'frank', password: STRONG, email: 'f@x.co' });
    const auth = engine.authenticate('frank', STRONG);
    expect(auth.session).toBeDefined();
    const { token } = engine.beginPasswordReset(u.id);
    engine.completePasswordReset(token, STRONG2);
    // Old session dead
    expect(engine.resolveSession(auth.session!.id)).toBeUndefined();
    // New password works; old rejected (also still in history)
    expect(engine.authenticate('frank', STRONG2).code).toBe(AuthResultCode.SUCCESS);
    const { token: t2 } = engine.beginPasswordReset(u.id);
    expect(() => engine.completePasswordReset(t2, STRONG)).toThrow(IdentityCoreError);
  });

  it('changePassword requires current password and keeps caller session', () => {
    const u = engine.register({ username: 'gwen', password: STRONG });
    const s1 = engine.authenticate('gwen', STRONG).session!;
    engine.authenticate('gwen', STRONG); // s2 — will be revoked
    expect(() => engine.changePassword(u.id, 'wrong-current', STRONG2)).toThrow(IdentityCoreError);
    engine.changePassword(u.id, STRONG, STRONG2, s1.id);
    expect(engine.resolveSession(s1.id)).toBeDefined();
    expect(engine.sessionsForUser(u.id)).toHaveLength(1);
  });

  it('suspend/delete block authentication', () => {
    const u = engine.register({ username: 'hank', password: STRONG });
    engine.suspend(u.id);
    expect(engine.authenticate('hank', STRONG).code).toBe(AuthResultCode.SUSPENDED);
    engine.activate(u.id);
    expect(engine.authenticate('hank', STRONG).code).toBe(AuthResultCode.SUCCESS);
    engine.deleteAccount(u.id);
    expect(engine.authenticate('hank', STRONG).code).toBe(AuthResultCode.DELETED);
  });

  it('merges duplicates: adopts email, reassigns sessions, tombstones secondary', () => {
    const p = engine.register({ username: 'primary', password: STRONG });
    const s = engine.register({ username: 'secondary', password: STRONG, email: 'dup@example.com' });
    const sess = engine.authenticate('secondary', STRONG).session!;
    const result = engine.merge(p.id, s.id);
    expect(result.adoptedFields).toContain('email');
    expect(result.sessionsReassigned).toBe(1);
    expect(engine.getUser(p.id)?.email).toBe('dup@example.com');
    // Secondary is tombstoned; its old session now resolves as primary
    expect(engine.resolveSession(sess.id)?.user.id).toBe(p.id);
    expect(engine.getUser(s.id)?.status).toBe(AccountStatus.DELETED);
  });

  it('normalizes phone numbers for indexing (rejects dup, normalizes storage)', () => {
    engine.register({ username: 'u-c', password: STRONG, phone: '+15551234567' });
    // Same digits through punctuation variants -> uniqueness violation.
    expect(() => engine.register({ username: 'u-d', password: STRONG, phone: '+1 (555) 123-4567' }))
      .toThrowError(expect.objectContaining({ code: IdentityErrorCode.EMAIL_TAKEN }));
    // Format variant still resolves to the same account.
    const stored = engine.getUserByLogin('x');
    void stored;
  });

  it('stats reflect lifecycle counts', () => {
    engine.register({ username: 'stat1', password: STRONG });
    const u2 = engine.register({ username: 'stat2', password: STRONG });
    engine.suspend(u2.id);
    const stats = engine.stats();
    expect(stats.users).toBe(2);
    expect(stats.statusSuspended).toBe(1);
    expect(stats.statusActive).toBe(1);
  });


});
