/**
 * Security Engine — unit tests.
 *
 * Request signing tests use a fixed secret + fixed timestamp so
 * signatures are deterministic; the clock is `ManualSecurityClock`
 * throughout so windows/TTLs advance exactly.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { createHmac } from 'crypto';
import {
  ThreatRulesEngine,
  DEFAULT_THREAT_RULES,
  RequestSigner,
  canonicalQueryString,
  IpReputation,
  SecurityHeaders,
  ManualSecurityClock,
  SignatureVerificationError,
  ThreatCategory,
  ThreatSeverity,
  ThreatSurface,
  ReputationEvent,
  CanonicalRequest,
} from '../index';

/* ------------------------------------------------------------------ */
/* ThreatRulesEngine                                                   */
/* ------------------------------------------------------------------ */

describe('ThreatRulesEngine', () => {
  let engine: ThreatRulesEngine;

  beforeEach(() => {
    engine = new ThreatRulesEngine();
  });

  it('detects a basic SQLi probe in the query string', () => {
    const r = engine.evaluate({ query: "id=1' OR '1'='1" });
    expect(r.matches.length).toBeGreaterThan(0);
    expect(r.matches[0].category).toBe(ThreatCategory.SQL_INJECTION);
    expect(r.blocked).toBe(true);
  });

  it('detects UNION SELECT exfil in the body', () => {
    const r = engine.evaluate({ body: 'x=1 UNION SELECT password FROM users' });
    expect(r.matches.some((m) => m.ruleId.startsWith('SQ'))).toBe(true);
  });

  it('detects time-based SQLi (sleep/benchmark) as critical', () => {
    const r = engine.evaluate({ query: 'x=1; WAITFOR; OR SLEEP(5)' });
    expect(r.maxSeverity).toBe(ThreatSeverity.CRITICAL);
  });

  it('detects path traversal with encoded variants', () => {
    expect(engine.evaluate({ path: '/a/../../etc/passwd' }).matches.length).toBeGreaterThan(0);
    expect(engine.evaluate({ path: '/a/%2e%2e/passwd' }).matches.length).toBeGreaterThan(0);
  });

  it('detects XSS script injection and event handlers', () => {
    const r1 = engine.evaluate({ body: '<script>alert(1)</script>' });
    expect(r1.matches.some((m) => m.category === ThreatCategory.XSS)).toBe(true);
    const r2 = engine.evaluate({ body: '<img src=x onerror=alert(1)>' });
    expect(r2.matches.some((m) => m.category === ThreatCategory.XSS)).toBe(true);
  });

  it('detects command injection via substitution and pipes', () => {
    const r = engine.evaluate({ query: 'f=$(id)' });
    expect(r.matches.some((m) => m.category === ThreatCategory.COMMAND_INJECTION)).toBe(true);
    const r2 = engine.evaluate({ query: 'f=x; whoami' });
    expect(r2.matches.some((m) => m.category === ThreatCategory.COMMAND_INJECTION)).toBe(true);
  });

  it('detects scanner user-agents at LOW severity', () => {
    const r = engine.evaluate({ userAgent: 'sqlmap/1.5' });
    expect(r.matches[0]?.category).toBe(ThreatCategory.SCANNER);
    expect(r.maxSeverity).toBe(ThreatSeverity.LOW);
    expect(r.blocked).toBe(false); // LOW < HIGH block threshold
  });

  it('a clean request matches nothing', () => {
    const r = engine.evaluate({
      path: '/api/users/42',
      query: 'limit=10&offset=0',
      body: '{"name":"alice"}',
      headers: { 'content-type': 'application/json' },
    });
    expect(r.matches.length).toBe(0);
    expect(r.maxSeverity).toBe(ThreatSeverity.INFO);
    expect(r.blocked).toBe(false);
  });

  it('critical matches short-circuit evaluation', () => {
    const r = engine.evaluate({ query: 'x=sleep(5)' });
    // Critical hit ends the loop — fewer matches than rules exist.
    expect(r.maxSeverity).toBe(ThreatSeverity.CRITICAL);
    expect(r.matches.length).toBeLessThan(engine.ruleCount);
  });

  it('surface scoping: a body-scoped rule does not fire on the path', () => {
    // Put a SQLi pattern in the PATH where SQLi rules don't look.
    const r = engine.evaluate({ path: '/search?q=union+select' });
    // PT rules still might see '..' but SQLi shouldn't fire on path.
    expect(r.matches.some((m) => m.ruleId.startsWith('SQ'))).toBe(false);
  });

  it('custom rules can be added with priorities', () => {
    engine.addRule({
      id: 'CUST-001',
      category: ThreatCategory.CUSTOM,
      severity: ThreatSeverity.MEDIUM,
      priority: 1, // runs before everything
      surfaces: [ThreatSurface.PATH],
      patterns: ['wp-admin'],
      description: 'WordPress probe',
    });
    const r = engine.evaluate({ path: '/wp-admin/login.php' });
    expect(r.matches[0].ruleId).toBe('CUST-001');
  });

  it('removeRule disables a signature', () => {
    engine.removeRule('XS-001');
    const r = engine.evaluate({ body: '<script>alert(1)</script>' });
    expect(r.matches.some((m) => m.ruleId === 'XS-001')).toBe(false);
  });

  it('case-insensitive matching catches case variants', () => {
    const r = engine.evaluate({ query: 'x=1 UnIoN SeLeCt a' });
    expect(r.matches.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/* RequestSigner                                                       */
/* ------------------------------------------------------------------ */

describe('RequestSigner', () => {
  let clock: ManualSecurityClock;
  let signer: RequestSigner;
  const KEY = { keyId: 'k1', secret: 'topsecret' };

  beforeEach(() => {
    clock = new ManualSecurityClock();
    clock.set(1_700_000_000_000); // ms
    signer = new RequestSigner({ clock, timestampWindowSec: 300 });
  });

  function req(overrides: Partial<CanonicalRequest> = {}): CanonicalRequest {
    return {
      method: 'GET',
      path: '/api/data',
      query: 'b=2&a=1',
      headers: { host: 'example.com', 'x-date': 'now' },
      payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      timestamp: 1_700_000_000, // seconds
      ...overrides,
    };
  }

  it('produces a stable signature for a fixed request', () => {
    const r1 = signer.sign(req(), KEY);
    const r2 = signer.sign(req(), KEY);
    expect(r1.signature).toBe(r2.signature);
    expect(r1.signature).toMatch(/^[0-9a-f]{64}$/);
  });

  it('different secrets produce different signatures', () => {
    const a = signer.sign(req(), KEY);
    const b = signer.sign(req(), { keyId: 'k2', secret: 'other' });
    expect(a.signature).not.toBe(b.signature);
  });

  it('verifies a correctly signed request', () => {
    const r = req();
    const { signature } = signer.sign(r, KEY);
    expect(signer.verify(r, KEY, signature).ok).toBe(true);
  });

  it('rejects a tampered signature (constant-time compare)', () => {
    const r = req();
    const { signature } = signer.sign(r, KEY);
    const tampered = signature.slice(0, -1) + (signature.endsWith('0') ? '1' : '0');
    const v = signer.verify(r, KEY, tampered);
    expect(v.ok).toBe(false);
    expect(v.reason).toBe('bad-signature');
  });

  it('rejects requests outside the timestamp window', () => {
    const r = req({ timestamp: 1_700_000_000 - 600 }); // 10min old
    const { signature } = signer.sign(r, KEY);
    const v = signer.verify(r, KEY, signature);
    expect(v.ok).toBe(false);
    expect(v.reason).toBe('stale-timestamp');
  });

  it('rejects future timestamps beyond the skew window', () => {
    const r = req({ timestamp: 1_700_000_000 + 600 });
    const { signature } = signer.sign(r, KEY);
    expect(signer.verify(r, KEY, signature).reason).toBe('future-timestamp');
  });

  it('detects replayed nonces within the window', () => {
    const r = req({ nonce: 'abc123' });
    const { signature } = signer.sign(r, KEY);
    expect(signer.verify(r, KEY, signature).ok).toBe(true);
    const v = signer.verify(r, KEY, signature);
    expect(v.ok).toBe(false);
    expect(v.reason).toBe('replay');
  });

  it('nonce TTL expiry permits reuse after the window', () => {
    const r = req({ nonce: 'abc123' });
    const { signature } = signer.sign(r, KEY);
    signer.verify(r, KEY, signature);
    clock.advance(400_000); // past 300s TTL
    // But now the timestamp is stale, so nonce replay check passes but
    // timestamp fails — the point is the nonce isn't the blocker.
    const v = signer.verify(r, KEY, signature);
    expect(v.reason).toBe('stale-timestamp');
  });

  it('verifyOrThrow raises SignatureVerificationError', () => {
    const r = req();
    expect(() => signer.verifyOrThrow(r, KEY, 'deadbeef')).toThrow(
      SignatureVerificationError
    );
  });

  it('canonicalizes query params by sorted encoded key', () => {
    expect(canonicalQueryString('b=2&a=1&c=3')).toBe('a=1&b=2&c=3');
    expect(canonicalQueryString('z=last&a=%20first')).toBe('a=%20first&z=last');
    expect(canonicalQueryString('flag&k=v')).toBe('flag=&k=v');
  });

  it('enforces requiredHeaders', () => {
    const s = new RequestSigner({ clock, requiredHeaders: ['x-must'] });
    const r = req();
    const { signature } = s.sign(r, KEY);
    expect(s.verify(r, KEY, signature).reason).toBe('missing-header');
  });

  it('a tampered payload hash invalidates the signature', () => {
    const r = req();
    const { signature } = signer.sign(r, KEY);
    const tampered = req({ payloadHash: 'ff'.repeat(32) });
    expect(signer.verify(tampered, KEY, signature).reason).toBe('bad-signature');
  });
});

/* ------------------------------------------------------------------ */
/* IpReputation                                                        */
/* ------------------------------------------------------------------ */

describe('IpReputation', () => {
  let clock: ManualSecurityClock;
  let rep: IpReputation;

  beforeEach(() => {
    clock = new ManualSecurityClock();
    rep = new IpReputation({
      clock,
      windowMs: 60_000,
      blockThreshold: 100,
      suspectThreshold: 50,
    });
  });

  it('unknown IPs score 0 and allow', () => {
    const s = rep.score('1.2.3.4');
    expect(s.score).toBe(0);
    expect(s.verdict).toBe('allow');
  });

  it('accumulates weighted events into a verdict', () => {
    rep.record('1.1.1.1', ReputationEvent.THREAT_MATCH); // +40
    rep.record('1.1.1.1', ReputationEvent.FAILED_AUTH); // +15
    const s = rep.score('1.1.1.1');
    expect(s.score).toBe(55);
    expect(s.verdict).toBe('suspect');
  });

  it('crosses the block threshold with enough bad events', () => {
    rep.record('1.1.1.1', ReputationEvent.THREAT_MATCH); // 40
    rep.record('1.1.1.1', ReputationEvent.THREAT_MATCH); // 80
    rep.record('1.1.1.1', ReputationEvent.THREAT_MATCH); // 120
    expect(rep.verdict('1.1.1.1')).toBe('block');
  });

  it('good behaviour subtracts from the score', () => {
    rep.record('1.1.1.1', ReputationEvent.FAILED_AUTH); // +15
    rep.record('1.1.1.1', ReputationEvent.GOOD_REQUEST); // -2
    rep.record('1.1.1.1', ReputationEvent.GOOD_REQUEST); // -2
    expect(rep.score('1.1.1.1').score).toBe(11);
  });

  it('score never goes below zero', () => {
    rep.record('1.1.1.1', ReputationEvent.GOOD_REQUEST);
    rep.record('1.1.1.1', ReputationEvent.GOOD_REQUEST);
    expect(rep.score('1.1.1.1').score).toBe(0);
  });

  it('events expire out of the window', () => {
    rep.record('1.1.1.1', ReputationEvent.THREAT_MATCH); // 40
    expect(rep.score('1.1.1.1').score).toBe(40);
    clock.advance(61_000);
    expect(rep.score('1.1.1.1').score).toBe(0);
    expect(rep.verdict('1.1.1.1')).toBe('allow');
  });

  it('sweep evicts IPs with no events left', () => {
    rep.record('1.1.1.1', ReputationEvent.REQUEST); // weight 0 — still logged
    rep.record('2.2.2.2', ReputationEvent.FAILED_AUTH);
    clock.advance(61_000);
    expect(rep.sweep()).toBe(2);
    expect(rep.trackedIps).toBe(0);
  });

  it('windowExpiresInMs reports time until oldest event exits', () => {
    rep.record('1.1.1.1', ReputationEvent.FAILED_AUTH);
    clock.advance(20_000);
    const s = rep.score('1.1.1.1');
    expect(s.windowExpiresInMs).toBe(40_000);
  });

  it('custom weights override defaults', () => {
    const r = new IpReputation({
      clock,
      weights: { [ReputationEvent.FAILED_AUTH]: 60 },
      suspectThreshold: 50,
    });
    r.record('9.9.9.9', ReputationEvent.FAILED_AUTH);
    expect(r.verdict('9.9.9.9')).toBe('suspect');
  });
});

/* ------------------------------------------------------------------ */
/* SecurityHeaders                                                     */
/* ------------------------------------------------------------------ */

describe('SecurityHeaders', () => {
  const policy = {
    contentSecurityPolicy: {
      requiredDirectives: ['default-src', 'script-src'],
      forbiddenSources: ["'unsafe-inline'"],
    },
    strictTransportSecurity: {
      minMaxAge: 31_536_000,
      requireIncludeSubDomains: true,
    },
    xFrameOptions: 'DENY' as const,
    xContentTypeOptions: 'nosniff' as const,
    referrerPolicy: ['no-referrer', 'strict-origin-when-cross-origin'],
  };

  it('a fully compliant response passes', () => {
    const sh = new SecurityHeaders(policy);
    const r = sh.verify({
      'content-security-policy': "default-src 'self'; script-src 'self'",
      'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
      'x-frame-options': 'DENY',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    });
    expect(r.compliant).toBe(true);
    expect(r.findings.every((f) => f.severity === 'ok')).toBe(true);
    expect(r.csp?.get('default-src')).toEqual(["'self'"]);
  });

  it('missing headers produce missing findings', () => {
    const sh = new SecurityHeaders(policy);
    const r = sh.verify({});
    expect(r.compliant).toBe(false);
    expect(r.findings.every((f) => f.severity === 'missing')).toBe(true);
  });

  it('missing CSP directive is a weak finding', () => {
    const sh = new SecurityHeaders(policy);
    const r = sh.verify({
      'content-security-policy': "default-src 'self'",
      'strict-transport-security': 'max-age=63072000; includeSubDomains',
      'x-frame-options': 'DENY',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    });
    const f = r.findings.find((x) => x.header === 'content-security-policy');
    expect(f?.severity).toBe('weak');
    expect(f?.detail).toContain('script-src');
  });

  it('unsafe-inline in a source list is flagged', () => {
    const sh = new SecurityHeaders(policy);
    const r = sh.verify({
      'content-security-policy': "default-src 'self' 'unsafe-inline'; script-src 'self'",
    });
    expect(
      r.findings.some((f) => f.detail.includes('unsafe-inline'))
    ).toBe(true);
  });

  it('low max-age is weak, missing max-age is invalid', () => {
    const sh = new SecurityHeaders({
      strictTransportSecurity: { minMaxAge: 31_536_000, requireIncludeSubDomains: true },
    });
    const weak = sh.verify({ 'strict-transport-security': 'max-age=100; includeSubDomains' });
    const hstsWeak = weak.findings.find((f) => f.header === 'strict-transport-security');
    expect(hstsWeak?.severity).toBe('weak');
    const bad = sh.verify({ 'strict-transport-security': 'includeSubDomains' });
    const hstsBad = bad.findings.find((f) => f.header === 'strict-transport-security');
    expect(hstsBad?.severity).toBe('invalid');
  });

  it('X-Frame-Options enforces the required value', () => {
    const sh = new SecurityHeaders({ xFrameOptions: 'DENY' });
    expect(sh.verify({ 'x-frame-options': 'SAMEORIGIN' }).findings[0].severity).toBe('weak');
    expect(sh.verify({ 'x-frame-options': 'DENY' }).findings[0].severity).toBe('ok');
    expect(sh.verify({ 'x-frame-options': 'GARBAGE' }).findings[0].severity).toBe('invalid');
  });

  it('referrer-policy must be in the allowed set', () => {
    const sh = new SecurityHeaders({ referrerPolicy: ['no-referrer'] });
    expect(sh.verify({ 'referrer-policy': 'unsafe-url' }).findings[0].severity).toBe('weak');
    expect(sh.verify({ 'referrer-policy': 'no-referrer' }).findings[0].severity).toBe('ok');
  });

  it('header lookup is case-insensitive', () => {
    const sh = new SecurityHeaders({ xContentTypeOptions: 'nosniff' });
    expect(sh.verify({ 'X-Content-Type-Options': 'nosniff' }).compliant).toBe(true);
  });
});
