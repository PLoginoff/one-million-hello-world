/**
 * MFA Engine 2 tests — WebAuthn ceremony, risk-based MFA, policy engine,
 * trusted-device tokens.
 */

import { describe, expect, it, beforeEach } from 'bun:test';
import {
  SeededRandomSource,
  sha256,
  SoftAuthenticator,
  StubSigner,
  utf8,
  hex,
  timingSafeEqual,
  assertionPayload,
  WebAuthnCeremony,
  WebAuthnError,
} from '../engine2/WebAuthn';
import { RiskScorer, StepUpDecider } from '../engine2/RiskBasedMfa';
import { MfaPolicyEngine, globMatch } from '../engine2/MfaPolicy';
import { TrustedDeviceStore } from '../engine2/TrustedDevice';
import { MfaOrchestrator, AuthAttempt } from '../engine2/MfaOrchestrator';
import { DEFAULT_WEIGHTS } from '../engine2/RiskBasedMfa';

/* ---------------------------------------------------------------------- */
/* WebAuthn ceremony                                                      */
/* ---------------------------------------------------------------------- */

describe('WebAuthnCeremony', () => {
  const rng = new SeededRandomSource(42n);
  const signer = new StubSigner();
  let now = 1_000_000;
  let ceremony: WebAuthnCeremony;
  let auth: SoftAuthenticator;

  const registerUser = (userHandle = 'u1', userName = 'alice') => {
    const ch = ceremony.beginRegistration('example.com', userHandle, userName);
    const att = auth.assert === undefined ? null : null;
    const resp = auth.attest(ch);
    return ceremony.finishRegistration(resp);
  };

  beforeEach(() => {
    now = 1_000_000;
    ceremony = new WebAuthnCeremony(signer, rng, () => now, 60_000);
    auth = new SoftAuthenticator(signer, rng);
  });

  it('registers a credential and asserts it', () => {
    const cred = registerUser();
    expect(cred.userHandle).toBe('u1');
    expect(cred.signCount).toBe(0);

    const ch = ceremony.beginAssertion('example.com');
    const resp = auth.assert(ch, cred.credentialId);
    const result = ceremony.finishAssertion(resp);
    expect(result.ok).toBe(true);
    expect(result.signCount).toBe(1);
  });

  it('rejects assertion with unknown challenge', () => {
    const cred = registerUser();
    const ch = ceremony.beginAssertion('example.com');
    const resp = auth.assert(ch, cred.credentialId);
    const bad = { ...resp, challenge: 'deadbeef' };
    const result = ceremony.finishAssertion(bad);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unknown challenge');
  });

  it('rejects assertion on rpId mismatch', () => {
    const cred = registerUser();
    const ch = ceremony.beginAssertion('example.com');
    const resp = auth.assert(ch, cred.credentialId);
    const bad = { ...resp, rpId: 'evil.com' };
    // signature is over (challenge | rpId | count) — changing rpId breaks it
    const result = ceremony.finishAssertion(bad);
    expect(result.ok).toBe(false);
  });

  it('challenges are single-use', () => {
    const cred = registerUser();
    const ch = ceremony.beginAssertion('example.com');
    const r1 = auth.assert(ch, cred.credentialId);
    expect(ceremony.finishAssertion(r1).ok).toBe(true);
    // replay the same challenge
    const r2 = auth.assert(ch, cred.credentialId);
    const result = ceremony.finishAssertion(r2);
    expect(result.ok).toBe(false);
  });

  it('detects cloned authenticators via signCount regression', () => {
    const cred = registerUser();
    // first assertion: count 1
    const ch1 = ceremony.beginAssertion('example.com');
    ceremony.finishAssertion(auth.assert(ch1, cred.credentialId));
    // second authenticator with the same key but its own counter starting at 0
    const clone = new SoftAuthenticator(signer, new SeededRandomSource(42n));
    // force same credentialId by reusing private key material:
    // simulate by registering a second credential with the same ID —
    // simplest: replay a stale signCount. Craft a response manually.
    const ch2 = ceremony.beginAssertion('example.com');
    const stalePayload = assertionPayload(ch2.challenge, ch2.rpId, 1);
    const key = cred.publicKey; // stub: public == private
    const resp = {
      challenge: ch2.challenge,
      credentialId: cred.credentialId,
      rpId: 'example.com',
      signCount: 1, // regression
      signature: signer.sign(key, stalePayload),
    };
    const result = ceremony.finishAssertion(resp);
    expect(result.ok).toBe(false);
    expect(result.cloneDetected).toBe(true);
    expect(ceremony.credential(cred.credentialId)?.cloned).toBe(true);
  });

  it('rejects expired challenges', () => {
    const cred = registerUser();
    const ch = ceremony.beginAssertion('example.com');
    now += 61_000; // past TTL
    const resp = auth.assert(ch, cred.credentialId);
    // challenge was consumed only in finishAssertion — but expiry is checked
    const result = ceremony.finishAssertion(resp);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('challenge expired');
  });

  it('honours allowCredentials restriction', () => {
    registerUser('u1', 'alice');
    const cred2 = registerUser('u2', 'bob');
    const ch = ceremony.beginAssertion('example.com', ['some-other-id']);
    const resp = auth.assert(ch, cred2.credentialId);
    const result = ceremony.finishAssertion(resp);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('credential not allowed');
  });

  it('gc purges expired challenges', () => {
    ceremony.beginAssertion('example.com');
    ceremony.beginAssertion('example.com');
    now += 61_000;
    ceremony.beginAssertion('example.com'); // fresh
    expect(ceremony.gc()).toBe(2);
  });

  it('lists credentials per user', () => {
    registerUser('u1', 'a');
    registerUser('u1', 'a');
    registerUser('u2', 'b');
    expect(ceremony.credentialsFor('u1').length).toBe(2);
    expect(ceremony.credentialsFor('u2').length).toBe(1);
  });
});

describe('sha256 + utilities', () => {
  it('computes the known SHA-256 of "abc"', () => {
    // FIPS 180-4 test vector
    expect(hex(sha256(utf8('abc')))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('computes SHA-256 of empty input', () => {
    expect(hex(sha256(new Uint8Array(0)))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });

  it('timingSafeEqual works', () => {
    expect(timingSafeEqual(utf8('aa'), utf8('aa'))).toBe(true);
    expect(timingSafeEqual(utf8('aa'), utf8('ab'))).toBe(false);
    expect(timingSafeEqual(utf8('aa'), utf8('aaa'))).toBe(false);
  });
});

/* ---------------------------------------------------------------------- */
/* Risk-based MFA                                                         */
/* ---------------------------------------------------------------------- */

describe('RiskScorer', () => {
  const scorer = new RiskScorer();

  it('allows low-risk attempts', () => {
    const a = scorer.assess({ knownDevice: true, impossibleTravel: false, hourOfDay: 10 });
    expect(a.decision).toBe('allow');
    expect(a.score).toBe(0);
  });

  it('steps up on unknown device', () => {
    const a = scorer.assess({ knownDevice: false, impossibleTravel: false, hourOfDay: 10 });
    expect(a.decision).toBe('step-up');
    expect(a.contributions.some((c) => c.signal === 'unknown-device')).toBe(true);
  });

  it('denies on combined high risk', () => {
    const a = scorer.assess({
      knownDevice: false,
      impossibleTravel: true,
      hourOfDay: 3,
      ipReputation: 0.9,
      recentFailures: 5,
      actionSensitivity: 'high',
    });
    expect(a.decision).toBe('deny');
    expect(a.score).toBeGreaterThanOrEqual(80);
  });

  it('clamps score to 100', () => {
    const a = scorer.assess({
      knownDevice: false,
      impossibleTravel: true,
      hourOfDay: 2,
      ipReputation: 1,
      recentFailures: 50,
      actionSensitivity: 'high',
      recentAccountRecovery: true,
      corporateNetwork: false,
    });
    expect(a.score).toBe(100);
  });

  it('respects custom thresholds', () => {
    const strict = new RiskScorer({ lowThreshold: 10, highThreshold: 40 });
    const a = strict.assess({ knownDevice: false, impossibleTravel: false, hourOfDay: 10 });
    expect(a.decision).toBe('step-up');
  });
});

describe('StepUpDecider', () => {
  const decider = new StepUpDecider();
  const scorer = new RiskScorer();

  it('prefers webauthn over totp over sms', () => {
    const a = scorer.assess({ knownDevice: false, impossibleTravel: false, hourOfDay: 10 });
    expect(decider.chooseFactor(['sms', 'totp', 'webauthn'], a)).toBe('webauthn');
    expect(decider.chooseFactor(['sms', 'totp'], a)).toBe('totp');
    expect(decider.chooseFactor(['sms'], a)).toBe('sms');
  });

  it('returns null when no factor needed', () => {
    const a = scorer.assess({ knownDevice: true, impossibleTravel: false, hourOfDay: 10 });
    expect(decider.chooseFactor(['totp'], a)).toBeNull();
  });

  it('flags second factor for high step-up scores', () => {
    const scorer2 = new RiskScorer({ lowThreshold: 30, highThreshold: 80 });
    const a = scorer2.assess({
      knownDevice: false,
      impossibleTravel: false,
      hourOfDay: 3,
      recentFailures: 3,
      actionSensitivity: 'medium',
    });
    expect(a.decision).toBe('step-up');
    expect(a.score).toBeGreaterThanOrEqual(60);
    expect(decider.requiresSecondFactor(a)).toBe(true);
  });
});

/* ---------------------------------------------------------------------- */
/* Policy engine                                                          */
/* ---------------------------------------------------------------------- */

describe('globMatch', () => {
  it('matches exact strings', () => {
    expect(globMatch('a.b.c', 'a.b.c')).toBe(true);
    expect(globMatch('a.b.c', 'a.b.d')).toBe(false);
  });
  it('matches * within segments', () => {
    expect(globMatch('payment.*', 'payment.wire')).toBe(true);
    expect(globMatch('payment.*', 'payment.wire.create')).toBe(false);
    expect(globMatch('user:admin-*', 'user:admin-42')).toBe(true);
  });
  it('matches ** across segments', () => {
    expect(globMatch('payment.**', 'payment.wire.create.us')).toBe(true);
    expect(globMatch('**.create', 'payment.wire.create')).toBe(true);
    expect(globMatch('a.**.z', 'a.b.c.d.z')).toBe(true);
  });
  it('undefined pattern matches all', () => {
    expect(globMatch(undefined, 'anything')).toBe(true);
  });
});

describe('MfaPolicyEngine', () => {
  let engine: MfaPolicyEngine;
  beforeEach(() => {
    engine = new MfaPolicyEngine();
  });

  it('returns not-required when no rules match', () => {
    const d = engine.evaluate({ user: 'u1', action: 'read' });
    expect(d.required).toBe(false);
  });

  it('first-priority rule wins', () => {
    engine.addRule({
      id: 'catch-all',
      priority: 100,
      requirement: { mode: 'any-of', factors: ['sms'] },
    });
    engine.addRule({
      id: 'wire',
      priority: 10,
      action: 'payment.wire',
      requirement: { mode: 'any-of', factors: ['webauthn', 'totp'] },
    });
    const d = engine.evaluate({ user: 'u1', action: 'payment.wire' });
    expect(d.ruleId).toBe('wire');
    const d2 = engine.evaluate({ user: 'u1', action: 'profile.view' });
    expect(d2.ruleId).toBe('catch-all');
  });

  it('matches on user glob and groups', () => {
    engine.addRule({
      id: 'admins',
      priority: 1,
      user: 'admin-*',
      groups: ['it-ops'],
      requirement: { mode: 'all-of', factors: ['webauthn', 'totp'] },
    });
    const d = engine.evaluate({ user: 'admin-1', action: 'x', groups: ['it-ops'] });
    expect(d.required).toBe(true);
    const d2 = engine.evaluate({ user: 'admin-1', action: 'x', groups: ['hr'] });
    expect(d2.required).toBe(false);
  });

  it('any-of satisfaction', () => {
    engine.addRule({
      id: 'r',
      priority: 1,
      action: '**',
      requirement: { mode: 'any-of', factors: ['webauthn', 'totp'] },
    });
    const d = engine.evaluate({ user: 'u', action: 'a.b' });
    const ok = engine.satisfies(d, [{ factor: 'totp', assertedAt: 1000 }], 2000);
    expect(ok.ok).toBe(true);
    const bad = engine.satisfies(d, [{ factor: 'sms', assertedAt: 1000 }], 2000);
    expect(bad.ok).toBe(false);
    expect(bad.missing).toEqual(['webauthn', 'totp']);
  });

  it('all-of requires every factor', () => {
    engine.addRule({
      id: 'r',
      priority: 1,
      requirement: { mode: 'all-of', factors: ['webauthn', 'totp'] },
    });
    const d = engine.evaluate({ user: 'u', action: 'a' });
    const partial = engine.satisfies(d, [{ factor: 'totp', assertedAt: 0 }]);
    expect(partial.ok).toBe(false);
    expect(partial.missing).toEqual(['webauthn']);
    const full = engine.satisfies(d, [
      { factor: 'totp', assertedAt: 0 },
      { factor: 'webauthn', assertedAt: 0 },
    ]);
    expect(full.ok).toBe(true);
  });

  it('enforces maxAgeMs freshness', () => {
    engine.addRule({
      id: 'fresh',
      priority: 1,
      requirement: { mode: 'any-of', factors: ['totp'], maxAgeMs: 60_000 },
    });
    const d = engine.evaluate({ user: 'u', action: 'a' });
    const fresh = engine.satisfies(d, [{ factor: 'totp', assertedAt: 950_000 }], 1_000_000);
    expect(fresh.ok).toBe(true);
    const stale = engine.satisfies(d, [{ factor: 'totp', assertedAt: 900_000 }], 1_000_000);
    expect(stale.ok).toBe(false);
  });

  it('default requirement applies when nothing matches', () => {
    const e = new MfaPolicyEngine({ mode: 'any-of', factors: ['totp'] });
    const d = e.evaluate({ user: 'u', action: 'anything' });
    expect(d.required).toBe(true);
    expect(d.reason).toBe('default requirement');
  });
});

/* ---------------------------------------------------------------------- */
/* Trusted devices                                                        */
/* ---------------------------------------------------------------------- */

describe('TrustedDeviceStore', () => {
  let now = 1_000_000;
  let store: TrustedDeviceStore;
  const rng = new SeededRandomSource(7n);

  beforeEach(() => {
    now = 1_000_000;
    store = new TrustedDeviceStore(rng, () => now, { tokenTtlMs: 60_000 }, utf8('secret'));
  });

  it('issues and validates a token', () => {
    store.registerDevice('u1', 'd1', 'laptop');
    const t = store.issueToken('u1', 'd1');
    const ok = store.validate(t.token);
    expect(ok).toEqual({ userId: 'u1', deviceId: 'd1' });
  });

  it('rejects tampered tokens', () => {
    store.registerDevice('u1', 'd1', 'laptop');
    const t = store.issueToken('u1', 'd1');
    const tampered = t.token.slice(0, -2) + 'ff';
    expect(store.validate(tampered)).toBeNull();
  });

  it('rejects expired tokens', () => {
    store.registerDevice('u1', 'd1', 'laptop');
    const t = store.issueToken('u1', 'd1');
    now += 61_000;
    expect(store.validate(t.token)).toBeNull();
  });

  it('rejects tokens for revoked devices', () => {
    store.registerDevice('u1', 'd1', 'laptop');
    const t = store.issueToken('u1', 'd1');
    store.revokeDevice('u1', 'd1');
    expect(store.validate(t.token)).toBeNull();
  });

  it('rotates tokens', () => {
    store.registerDevice('u1', 'd1', 'laptop');
    const t1 = store.issueToken('u1', 'd1');
    const t2 = store.rotate(t1.token);
    expect(t2).not.toBeNull();
    expect(t2!.token).not.toBe(t1.token);
    expect(store.validate(t1.token)).toBeNull(); // old revoked
    expect(store.validate(t2!.token)).not.toBeNull();
  });

  it('evicts oldest tokens beyond per-user cap', () => {
    const s = new TrustedDeviceStore(rng, () => now, { maxTokensPerUser: 2 }, utf8('s'));
    s.registerDevice('u1', 'd1', 'a');
    const t1 = s.issueToken('u1', 'd1');
    const t2 = s.issueToken('u1', 'd1');
    const t3 = s.issueToken('u1', 'd1');
    expect(s.tokenCount('u1')).toBe(2);
    expect(s.validate(t1.token)).toBeNull(); // oldest evicted
    expect(s.validate(t3.token)).not.toBeNull();
  });

  it('tracks trustScore on successive validations', () => {
    store.registerDevice('u1', 'd1', 'laptop');
    const t = store.issueToken('u1', 'd1');
    store.validate(t.token);
    store.validate(t.token);
    const d = store.device('u1', 'd1');
    expect(d!.trustScore).toBe(2);
  });

  it('gc drops expired tokens', () => {
    store.registerDevice('u1', 'd1', 'laptop');
    store.issueToken('u1', 'd1');
    now += 61_000;
    expect(store.gc()).toBe(1);
  });
});

/* ---------------------------------------------------------------------- */
/* Orchestrator — end-to-end flow                                         */
/* ---------------------------------------------------------------------- */

describe('MfaOrchestrator', () => {
  let now = 1_000_000;
  const rng = new SeededRandomSource(9n);

  const build = () => {
    const policy = new MfaPolicyEngine();
    policy.addRule({
      id: 'wire',
      priority: 1,
      action: 'payment.wire',
      requirement: { mode: 'any-of', factors: ['webauthn', 'totp', 'device'] },
    });
    const scorer = new RiskScorer();
    const devices = new TrustedDeviceStore(rng, () => now, {}, utf8('s'));
    return { orchestrator: new MfaOrchestrator(policy, scorer, devices), devices };
  };

  const attempt = (over: Partial<AuthAttempt> = {}): AuthAttempt => ({
    user: 'u1',
    action: 'payment.wire',
    risk: { knownDevice: true, impossibleTravel: false, hourOfDay: 10 },
    ...over,
  });

  it('challenges when policy requires MFA', () => {
    const { orchestrator } = build();
    const plan = orchestrator.plan(attempt());
    expect(plan.action).toBe('challenge');
    expect(plan.factor).toBe('webauthn');
  });

  it('allows when no policy and low risk', () => {
    const { orchestrator } = build();
    const plan = orchestrator.plan(attempt({ action: 'profile.view' }));
    expect(plan.action).toBe('allow');
  });

  it('denies on high risk regardless of policy', () => {
    const { orchestrator } = build();
    const plan = orchestrator.plan(
      attempt({ risk: { knownDevice: false, impossibleTravel: true, hourOfDay: 3, ipReputation: 1, recentFailures: 9 } })
    );
    expect(plan.action).toBe('deny');
  });

  it('trusted-device token satisfies device-class requirements', () => {
    const { orchestrator, devices } = build();
    devices.registerDevice('u1', 'dev-1', 'laptop');
    const tok = devices.issueToken('u1', 'dev-1');
    const plan = orchestrator.plan(attempt({ deviceId: 'dev-1', deviceToken: tok.token }));
    expect(plan.action).toBe('allow');
    expect(plan.reason).toContain('trusted device');
  });

  it('issues a device token after challenge passes', () => {
    const { orchestrator } = build();
    const tok = orchestrator.onChallengePassed(attempt({ deviceId: 'dev-9' }), true);
    expect(tok).toBeDefined();
    // token is now usable
    const plan = orchestrator.plan(attempt({ deviceId: 'dev-9', deviceToken: tok }));
    expect(plan.action).toBe('allow');
  });
});
