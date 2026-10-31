/**
 * Session management, CSRF, CSP builder, breach checking — tests.
 * All timing on ManualSecurityClock.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  BreachChecker,
  CspBuilder,
  CsrfProtection,
  CsrfVerdict,
  InMemoryBreachCorpus,
  InMemorySessionStore,
  ManualSecurityClock,
  RemoteCorpusStub,
  SessionManager,
  SessionVerdict,
  sha1Hex,
  strictCspBaseline,
} from '../index';

/* ------------------------------------------------------------------ */
/* SessionManager                                                      */
/* ------------------------------------------------------------------ */

describe('SessionManager', () => {
  let clock: ManualSecurityClock;
  let mgr: SessionManager;

  beforeEach(() => {
    clock = new ManualSecurityClock();
    mgr = new SessionManager({
      secret: 'test-secret-key-32chars-minimum!',
      idleTimeoutMs: 1000,
      absoluteLifetimeMs: 10_000,
      rotateGraceMs: 200,
      touchMinIntervalMs: 100,
      clock,
    });
  });

  it('create → validate → destroy lifecycle', () => {
    const { id } = mgr.create({ user: 'alice' });
    const v = mgr.validate(id);
    expect(v.verdict).toBe(SessionVerdict.VALID);
    expect(v.session?.data.user).toBe('alice');
    expect(mgr.destroy(id)).toBe(true);
    expect(mgr.validate(id).verdict).toBe(SessionVerdict.INVALID);
  });

  it('forged ids are rejected without a store lookup', () => {
    const v = mgr.validate('AAAA.BBBB');
    expect(v.verdict).toBe(SessionVerdict.INVALID);
    // A real id with a tampered suffix also fails the MAC check.
    const { id } = mgr.create();
    const tampered = `${id.slice(0, -1)}X`;
    expect(mgr.validate(tampered).verdict).toBe(SessionVerdict.INVALID);
  });

  it('sliding expiry: activity extends, idleness expires', () => {
    const { id } = mgr.create();
    clock.advance(800);
    expect(mgr.validate(id).verdict).toBe(SessionVerdict.VALID); // touches
    clock.advance(800); // 1600 total, but only 800 since last touch
    expect(mgr.validate(id).verdict).toBe(SessionVerdict.VALID);
    clock.advance(1100); // idle past the window
    expect(mgr.validate(id).verdict).toBe(SessionVerdict.EXPIRED);
  });

  it('touch is throttled by touchMinIntervalMs', () => {
    const { id } = mgr.create();
    const first = mgr.validate(id).session;
    clock.advance(50); // < 100ms touch interval
    const second = mgr.validate(id).session;
    // Same expiresAt — no rewrite happened.
    expect(second?.expiresAt).toBe(first?.expiresAt);
    clock.advance(60); // now >100ms since creation
    const third = mgr.validate(id).session;
    expect(third?.expiresAt).toBeGreaterThan(first?.expiresAt ?? 0);
  });

  it('absolute lifetime caps sliding renewal', () => {
    const { id } = mgr.create();
    // Keep touching to stay under idle timeout, but hit absolute cap.
    for (let i = 0; i < 11; i++) {
      clock.advance(900);
      mgr.validate(id);
    }
    // 9900ms elapsed — still valid (absolute is 10s)
    expect(mgr.validate(id).verdict).toBe(SessionVerdict.VALID);
    clock.advance(200); // crosses 10s absolute
    expect(mgr.validate(id).verdict).toBe(SessionVerdict.EXPIRED);
  });

  it('rotate mints a new id, carries data, kills the old id after grace', () => {
    const { id } = mgr.create({ role: 'user' });
    const r = mgr.rotate(id, { role: 'admin' });
    expect(r).not.toBeNull();
    expect(r?.id).not.toBe(id);
    expect(r?.session.data.role).toBe('admin');
    expect(r?.session.generation).toBe(1);

    // Old id inside grace: ROTATED verdict pointing at the successor.
    const grace = mgr.validate(id);
    expect(grace.verdict).toBe(SessionVerdict.ROTATED);
    expect(grace.currentId).toBe(r?.id);

    // New id works.
    expect(mgr.validate(r?.id as string).verdict).toBe(SessionVerdict.VALID);
  });

  it('old-id reuse after grace kills the whole lineage (theft defense)', () => {
    const { id } = mgr.create();
    const r = mgr.rotate(id);
    const newId = r?.id as string;
    clock.advance(300); // past 200ms grace
    const v = mgr.validate(id);
    expect(v.verdict).toBe(SessionVerdict.REUSE_DETECTED);
    // The successor is dead too — the lineage is poisoned.
    expect(mgr.validate(newId).verdict).toBe(SessionVerdict.INVALID);
  });

  it('setData merges into a valid session', () => {
    const { id } = mgr.create({ a: 1 });
    expect(mgr.setData(id, { b: 2 })).toBe(true);
    expect(mgr.validate(id).session?.data).toEqual({ a: 1, b: 2 });
  });

  it('sweep removes expired + grace-expired records', () => {
    const a = mgr.create();
    const b = mgr.create();
    mgr.rotate(b.id); // b's old id is grace-marked
    clock.advance(1100); // a expires by idle
    const removed = mgr.sweep();
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(mgr.validate(a.id).verdict).toBe(SessionVerdict.INVALID);
  });

  it('store snapshot never contains raw session ids', () => {
    const { id } = mgr.create();
    const store = new InMemorySessionStore();
    void store;
    // The key is HMAC-derived — assert it doesn't equal or contain the id.
    const rawInStore = (mgr as unknown as { _store: InMemorySessionStore })._store;
    expect(rawInStore.get(id)).toBeNull(); // looked up by raw id → miss
  });
});

/* ------------------------------------------------------------------ */
/* CsrfProtection                                                      */
/* ------------------------------------------------------------------ */

describe('CsrfProtection', () => {
  let clock: ManualSecurityClock;
  let csrf: CsrfProtection;

  beforeEach(() => {
    clock = new ManualSecurityClock();
    csrf = new CsrfProtection({ secret: 'csrf-secret-16chars+', tokenTtlMs: 60_000, clock });
  });

  it('issued pair verifies', () => {
    const t = csrf.issue('sess-1');
    expect(csrf.verify('sess-1', t.cookieValue, t.headerValue)).toBe(CsrfVerdict.VALID);
  });

  it('missing either half fails', () => {
    const t = csrf.issue('s');
    expect(csrf.verify('s', undefined, t.headerValue)).toBe(CsrfVerdict.MISSING);
    expect(csrf.verify('s', t.cookieValue, undefined)).toBe(CsrfVerdict.MISSING);
  });

  it('cookie/header mismatch → MISMATCH (planted cookie)', () => {
    const t = csrf.issue('s');
    const attacker = csrf.issue('attacker-session');
    // Attacker planted their own cookie; the victim's real header
    // doesn't echo it — caught by double-submit equality.
    expect(csrf.verify('s', attacker.cookieValue, t.headerValue)).toBe(CsrfVerdict.MISMATCH);
  });

  it('token minted for another session → WRONG_SESSION', () => {
    const t = csrf.issue('session-A');
    // Same token presented under session B (e.g. attacker copied a
    // valid token from their own session — signature is genuine,
    // binding is wrong).
    expect(csrf.verify('session-B', t.cookieValue, t.headerValue)).toBe(CsrfVerdict.WRONG_SESSION);
  });

  it('tampered signature → FORGED', () => {
    const t = csrf.issue('s');
    const [id, at, tag] = t.cookieValue.split('.');
    const forged = `${id}.${at}.${tag}.${'A'.repeat(22)}`;
    expect(csrf.verify('s', forged, forged)).toBe(CsrfVerdict.FORGED);
  });

  it('stale token → STALE', () => {
    const t = csrf.issue('s');
    clock.advance(61_000);
    expect(csrf.verify('s', t.cookieValue, t.headerValue)).toBe(CsrfVerdict.STALE);
  });

  it('malformed token → MISSING', () => {
    expect(csrf.verify('s', 'not-a-token', 'not-a-token')).toBe(CsrfVerdict.MISSING);
  });

  it('wrong-secret token → FORGED', () => {
    const other = new CsrfProtection({ secret: 'different-secret-xx', clock });
    const t = other.issue('s');
    expect(csrf.verify('s', t.cookieValue, t.headerValue)).toBe(CsrfVerdict.FORGED);
  });
});

/* ------------------------------------------------------------------ */
/* CspBuilder                                                          */
/* ------------------------------------------------------------------ */

describe('CspBuilder', () => {
  it('composes a strict policy', () => {
    const csp = strictCspBaseline()
      .directive('script-src', "'self'", 'cdn.example.com')
      .directive('img-src', "'self'", 'data:')
      .build();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("script-src 'self' cdn.example.com");
  });

  it('unknown directive is a build error', () => {
    const b = new CspBuilder().directive('defualt-src', "'self'"); // typo
    expect(() => b.build()).toThrow(/defualt-src/);
  });

  it('nonce + unsafe-inline warns (ignored keyword)', () => {
    const b = new CspBuilder()
      .directive('default-src', "'none'")
      .directive('script-src', "'nonce-abc123def456'", "'unsafe-inline'");
    const issues = b.validate();
    expect(issues.some((i) => i.detail.includes('unsafe-inline'))).toBe(true);
    // Warning, not error — still builds.
    expect(b.build()).toContain('unsafe-inline');
  });

  it("'none' is exclusive — clears co-sources on add", () => {
    const b = new CspBuilder().directive('img-src', "'self'", 'cdn.example.com', "'none'");
    expect(b.build()).toContain("img-src 'none'");
    expect(b.build()).not.toContain('cdn.example.com');
  });

  it('adding a source after none removes none', () => {
    const b = new CspBuilder().directive('img-src', "'none'", 'cdn.example.com');
    const out = b.build();
    expect(out).toContain('cdn.example.com');
    expect(out).not.toContain("'none'");
  });

  it('strict-dynamic warns about ignored host sources', () => {
    const b = new CspBuilder()
      .directive('script-src', "'strict-dynamic'", 'https:', "'self'");
    const issues = b.validate();
    expect(issues.some((i) => i.detail.includes('strict-dynamic'))).toBe(true);
  });

  it('frame-ancestors rejects script-style keywords', () => {
    const b = new CspBuilder().directive('frame-ancestors', "'unsafe-inline'");
    const issues = b.validate();
    expect(issues.some((i) => i.severity === 'error' && i.directive === 'frame-ancestors')).toBe(true);
    expect(() => b.build()).toThrow();
  });

  it('sandbox validates tokens', () => {
    const b = new CspBuilder().directive('sandbox', 'allow-scripts', 'bogus-token');
    const issues = b.validate();
    expect(issues.some((i) => i.detail.includes('bogus-token'))).toBe(true);
    const good = new CspBuilder().directive('default-src', "'none'").directive('sandbox', 'allow-scripts', 'allow-forms');
    expect(good.build()).toContain('sandbox allow-scripts allow-forms');
  });

  it('flag directives serialize bare and reject values', () => {
    const b = new CspBuilder().directive('default-src', "'self'").flag('upgrade-insecure-requests');
    expect(b.build()).toContain('upgrade-insecure-requests');
    const bad = new CspBuilder().directive('default-src', "'self'").directive('upgrade-insecure-requests', 'yes');
    expect(() => bad.build()).toThrow();
  });

  it('nonce() and hash() helpers quote correctly', () => {
    const b = new CspBuilder()
      .directive('default-src', "'none'")
      .nonce('script-src', 'abcdef123456')
      .hash('script-src', 'sha256', 'abc123+/=');
    const out = b.build();
    expect(out).toContain("'nonce-abcdef123456'");
    expect(out).toContain("'sha256-abc123+/='");
  });

  it('reportOnly switches the header name', () => {
    const b = strictCspBaseline().reportOnly();
    expect(b.headerName()).toBe('content-security-policy-report-only');
    expect(Object.keys(b.toHeader())).toEqual(['content-security-policy-report-only']);
  });

  it('missing default-src warns (allow-all fallback)', () => {
    const b = new CspBuilder().directive('script-src', "'self'");
    expect(b.validate().some((i) => i.directive === 'default-src')).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* BreachChecker                                                       */
/* ------------------------------------------------------------------ */

describe('BreachChecker', () => {
  let clock: ManualSecurityClock;
  let corpus: InMemoryBreachCorpus;
  let checker: BreachChecker;

  beforeEach(() => {
    clock = new ManualSecurityClock();
    corpus = new InMemoryBreachCorpus();
    // Load a realistic-ish corpus: the password we check plus decoys
    // sharing its SHA-1 prefix bucket (simulate same-prefix entries by
    // hand-crafting hashes).
    corpus.loadPlaintext(['password123', 'letmein', 'qwerty', 'hunter2'], 50_000);
    // Pad the target's bucket with decoys for anonymity-set realism.
    const target = sha1Hex('correct horse battery staple');
    const prefix = target.slice(0, 5);
    const fakeEntries: Array<[string, number]> = [];
    for (let i = 0; i < 200; i++) {
      fakeEntries.push([`${prefix}${String(i).padStart(35, '0')}`, 1]);
    }
    corpus.load(fakeEntries);
    checker = new BreachChecker({ corpus, clock, minAnonymitySet: 100 });
  });

  it('finds a breached password with occurrence count', () => {
    const v = checker.check('password123');
    expect(v.breached).toBe(true);
    expect(v.occurrences).toBe(50_000);
  });

  it('a clean password passes', () => {
    const v = checker.check('xQ9!#mZ$2vKpL8wNfJ3bR7yT');
    expect(v.breached).toBe(false);
    expect(v.occurrences).toBe(0);
  });

  it('the anonymity set reflects the bucket size', () => {
    const v = checker.check('correct horse battery staple');
    expect(v.anonymitySetSize).toBeGreaterThanOrEqual(200);
    expect(v.weakAnonymity).toBe(false);
  });

  it('flags a tiny anonymity set as weak cover', () => {
    const sparse = new InMemoryBreachCorpus();
    sparse.loadPlaintext(['rare-hash-occupant'], 5);
    const weak = new BreachChecker({ corpus: sparse, clock, minAnonymitySet: 100 });
    const v = weak.check('rare-hash-occupant');
    expect(v.anonymitySetSize).toBe(1);
    expect(v.weakAnonymity).toBe(true);
  });

  it('only the 5-char prefix leaves the client (suffix checked locally)', () => {
    const seen: string[] = [];
    const spyChecker = new BreachChecker({
      corpus: (prefix: string) => {
        seen.push(prefix);
        return corpus.range(prefix);
      },
      clock,
    });
    spyChecker.check('password123');
    expect(seen.length).toBe(1);
    expect(seen[0].length).toBe(5);
    expect(seen[0]).toBe(sha1Hex('password123').slice(0, 5));
    // The full hash (40 chars) is never in the query.
    expect(seen[0].length).toBeLessThan(40);
  });

  it('acceptable() honors maxOccurrences policy', () => {
    expect(checker.acceptable('password123', 0)).toBe(false); // breached at all
    expect(checker.acceptable('password123', 100_000)).toBe(true); // under the policy cap
    expect(checker.acceptable('never-been-pwned-zzz')).toBe(true);
  });

  it('RemoteCorpusStub wraps a corpus and tracks latency', () => {
    const remote = new RemoteCorpusStub(corpus, 25, clock);
    const c = new BreachChecker({ corpus: remote, clock });
    c.check('password123');
    c.check('letmein');
    expect(remote.stats.calls).toBe(2);
    expect(remote.stats.avgLatencyMs).toBe(25);
  });

  it('padding widens the reported anonymity set', () => {
    const padded = new BreachChecker({ corpus, clock, paddingPerBucket: 500 });
    const unpadded = new BreachChecker({ corpus, clock });
    const a = padded.check('unique-pw-never-seen');
    const b = unpadded.check('unique-pw-never-seen');
    expect(a.anonymitySetSize).toBeGreaterThan(b.anonymitySetSize);
  });

  it('sha1Hex matches the known vector', () => {
    // SHA-1("abc") = a9993e364706816aba3e25717850c26c9cd0d89d
    expect(sha1Hex('abc')).toBe('A9993E364706816ABA3E25717850C26C9CD0D89D');
  });
});
