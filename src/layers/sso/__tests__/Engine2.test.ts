/**
 * SSO Engine 2 tests — session federation, logout propagation, identity
 * linking, JIT provisioning, audit trail.
 */

import { describe, expect, it, beforeEach } from 'bun:test';
import { SeededRandomSource } from '../../mfa/engine2/WebAuthn';
import { SessionFederation, FederationError } from '../engine2/SessionFederation';
import { LogoutPropagator, ILogoutTransport, RelyingParty } from '../engine2/LogoutPropagation';
import { IdentityLinker, LinkError } from '../engine2/IdentityLinking';
import { JitProvisioner, ProvisioningPolicy } from '../engine2/JitProvisioning';
import { SsoAuditTrail, IEventSink, SsoEvent } from '../engine2/SsoAudit';
import { TokenExchange } from '../engine2/TokenExchange';

/* ---------------------------------------------------------------------- */
/* Session federation                                                     */
/* ---------------------------------------------------------------------- */

describe('SessionFederation', () => {
  let now = 1_000_000;
  const rng = new SeededRandomSource(11n);
  let fed: SessionFederation;

  beforeEach(() => {
    now = 1_000_000;
    fed = new SessionFederation(rng, () => now, { tokenTtlMs: 30_000 });
  });

  it('federates a session across domains', () => {
    const s = fed.createSession('app-a.com', 'user-1', { role: 'admin' });
    const token = fed.mintToken(s.sessionId, 'app-b.net');
    const s2 = fed.exchange(token, 'app-b.net');
    expect(s2).not.toBeNull();
    expect(s2!.subject).toBe('user-1');
    expect(s2!.domain).toBe('app-b.net');
    expect(s2!.attributes.role).toBe('admin');
  });

  it('tokens are single-use', () => {
    const s = fed.createSession('a.com', 'u');
    const token = fed.mintToken(s.sessionId, 'b.net');
    expect(fed.exchange(token, 'b.net')).not.toBeNull();
    expect(fed.exchange(token, 'b.net')).toBeNull(); // replay
  });

  it('rejects tokens presented to the wrong domain', () => {
    const s = fed.createSession('a.com', 'u');
    const token = fed.mintToken(s.sessionId, 'b.net');
    expect(fed.exchange(token, 'c.org')).toBeNull();
    // and the token is NOT consumed by the wrong-domain attempt
    expect(fed.exchange(token, 'b.net')).not.toBeNull();
  });

  it('rejects expired tokens', () => {
    const s = fed.createSession('a.com', 'u');
    const token = fed.mintToken(s.sessionId, 'b.net');
    now += 31_000;
    expect(fed.exchange(token, 'b.net')).toBeNull();
  });

  it('rejects tampered tokens', () => {
    const s = fed.createSession('a.com', 'u');
    const token = fed.mintToken(s.sessionId, 'b.net');
    const tampered = token.slice(0, token.length - 2) + 'ff';
    expect(fed.exchange(tampered, 'b.net')).toBeNull();
  });

  it('enforces allowed domain pairs', () => {
    const restricted = new SessionFederation(rng, () => now, {
      allowedPairs: [['a.com', 'b.net']],
    });
    const s = restricted.createSession('a.com', 'u');
    expect(() => restricted.mintToken(s.sessionId, 'c.org')).toThrow(FederationError);
    expect(() => restricted.mintToken(s.sessionId, 'b.net')).not.toThrow();
  });

  it('inspect validates without consuming', () => {
    const s = fed.createSession('a.com', 'u');
    const token = fed.mintToken(s.sessionId, 'b.net');
    const inspected = fed.inspect(token);
    expect(inspected!.subject).toBe('u');
    expect(fed.exchange(token, 'b.net')).not.toBeNull(); // still usable
  });

  it('revokeForSubject kills sessions on all domains', () => {
    const s1 = fed.createSession('a.com', 'u');
    const s2 = fed.createSession('b.net', 'u');
    const s3 = fed.createSession('a.com', 'other');
    expect(fed.revokeForSubject('u')).toBe(2);
    expect(fed.session(s1.sessionId)).toBeUndefined();
    expect(fed.session(s3.sessionId)).not.toBeUndefined();
  });
});

/* ---------------------------------------------------------------------- */
/* Logout propagation                                                     */
/* ---------------------------------------------------------------------- */

describe('LogoutPropagator', () => {
  let now = 1_000_000;
  const delivered: Array<{ rpId: string; sessionId: string }> = [];

  const goodTransport: ILogoutTransport = {
    deliver: async (rp: RelyingParty, s) => {
      delivered.push({ rpId: rp.id, sessionId: s.sessionId });
      return true;
    },
  };

  beforeEach(() => {
    delivered.length = 0;
    now = 1_000_000;
  });

  it('fans out backchannel logout to all RPs holding sessions', async () => {
    const p = new LogoutPropagator(goodTransport, {}, () => now);
    p.registerRp({ id: 'rp1', channel: 'backchannel', endpoint: 'https://rp1/logout' });
    p.registerRp({ id: 'rp2', channel: 'backchannel', endpoint: 'https://rp2/logout' });
    p.trackSession({ sessionId: 's1', rpId: 'rp1', subject: 'u' });
    p.trackSession({ sessionId: 's2', rpId: 'rp2', subject: 'u' });
    p.trackSession({ sessionId: 's3', rpId: 'rp1', subject: 'other' });

    const result = await p.propagate('u');
    expect(result.records.length).toBe(2);
    expect(result.records.every((r) => r.delivered)).toBe(true);
    expect(delivered.map((d) => d.sessionId).sort()).toEqual(['s1', 's2']);
    // sessions removed
    expect(p.sessionsFor('u').length).toBe(0);
    expect(p.sessionsFor('other').length).toBe(1);
  });

  it('produces front-channel descriptors when no transport/endpoint', async () => {
    const p = new LogoutPropagator(goodTransport, {}, () => now);
    p.registerRp({ id: 'rp-fc', channel: 'front-channel' });
    p.trackSession({ sessionId: 's1', rpId: 'rp-fc', subject: 'u' });
    const result = await p.propagate('u');
    expect(result.frontChannel.length).toBe(1);
    expect(result.frontChannel[0].rpId).toBe('rp-fc');
    expect(result.records.length).toBe(0);
  });

  it('retries with backoff and records failures', async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const flaky: ILogoutTransport = {
      deliver: async () => {
        calls++;
        return calls >= 3;
      },
    };
    const p = new LogoutPropagator(
      flaky,
      { maxAttempts: 4, backoffBaseMs: 10 },
      () => now,
      async (ms) => {
        sleeps.push(ms);
      }
    );
    p.registerRp({ id: 'rp1', channel: 'backchannel', endpoint: 'x' });
    p.trackSession({ sessionId: 's1', rpId: 'rp1', subject: 'u' });
    const result = await p.propagate('u');
    expect(result.records[0].delivered).toBe(true);
    expect(result.records[0].attempts).toBe(3);
    expect(sleeps).toEqual([10, 20]); // exponential backoff
  });

  it('gives up after maxAttempts', async () => {
    const fail: ILogoutTransport = { deliver: async () => false };
    const p = new LogoutPropagator(fail, { maxAttempts: 2 }, () => now);
    p.registerRp({ id: 'rp1', channel: 'backchannel', endpoint: 'x' });
    p.trackSession({ sessionId: 's1', rpId: 'rp1', subject: 'u' });
    const result = await p.propagate('u');
    expect(result.records[0].delivered).toBe(false);
    expect(result.records[0].attempts).toBe(2);
    // session NOT removed on failed delivery
    expect(p.sessionsFor('u').length).toBe(1);
  });
});

/* ---------------------------------------------------------------------- */
/* Identity linking                                                       */
/* ---------------------------------------------------------------------- */

describe('IdentityLinker', () => {
  let linker: IdentityLinker;
  beforeEach(() => {
    linker = new IdentityLinker(() => 1_000_000);
  });

  it('links identities and resolves logins', () => {
    const p = linker.createPrincipal({ email: 'a@corp.com' });
    linker.link(p.id, { idpId: 'google', subject: 'alice@gmail.com', attributes: {} });
    linker.link(p.id, { idpId: 'github', subject: 'alicegh', attributes: {} });
    expect(linker.resolve('google', 'alice@gmail.com')!.id).toBe(p.id);
    expect(linker.resolve('github', 'alicegh')!.id).toBe(p.id);
    expect(linker.identitiesFor(p.id).length).toBe(2);
  });

  it('moving an identity records movedFrom', () => {
    const p1 = linker.createPrincipal();
    const p2 = linker.createPrincipal();
    linker.link(p1.id, { idpId: 'g', subject: 's', attributes: {} });
    const result = linker.link(p2.id, { idpId: 'g', subject: 's', attributes: {} });
    expect(result.movedFrom).toBe(p1.id);
    expect(linker.resolve('g', 's')!.id).toBe(p2.id);
    expect(linker.identitiesFor(p1.id).length).toBe(0);
  });

  it('detects attribute conflicts and fills gaps', () => {
    const p = linker.createPrincipal({ email: 'a@corp.com' });
    const r = linker.link(p.id, {
      idpId: 'google',
      subject: 'x',
      attributes: { email: 'a@gmail.com', name: 'Alice' },
    });
    expect(r.conflicts.length).toBe(1);
    expect(r.conflicts[0].attribute).toBe('email');
    // principal attribute wins; gap filled
    expect(p.attributes.email).toBe('a@corp.com');
    expect(p.attributes.name).toBe('Alice');
  });

  it('merges principals and follows tombstones', () => {
    const p1 = linker.createPrincipal({ a: '1' });
    const p2 = linker.createPrincipal({ b: '2', a: 'conflict' });
    linker.link(p2.id, { idpId: 'g', subject: 's2', attributes: {} });
    const r = linker.merge(p1.id, p2.id);
    expect(r.conflicts.length).toBe(1); // 'a' conflict
    expect(linker.resolve('g', 's2')!.id).toBe(p1.id);
    expect(linker.resolvePrincipal(p2.id)!.id).toBe(p1.id);
    expect(p1.attributes.b).toBe('2');
    expect(p1.attributes.a).toBe('1'); // primary wins
  });

  it('rejects linking to merged principals', () => {
    const p1 = linker.createPrincipal();
    const p2 = linker.createPrincipal();
    linker.merge(p1.id, p2.id);
    expect(() =>
      linker.link(p2.id, { idpId: 'g', subject: 'x', attributes: {} })
    ).toThrow(LinkError);
  });

  it('unlink removes the binding', () => {
    const p = linker.createPrincipal();
    linker.link(p.id, { idpId: 'g', subject: 's', attributes: {} });
    expect(linker.unlink('g', 's')).toBe(p.id);
    expect(linker.resolve('g', 's')).toBeUndefined();
  });
});

/* ---------------------------------------------------------------------- */
/* JIT provisioning                                                       */
/* ---------------------------------------------------------------------- */

describe('JitProvisioner', () => {
  const policy: ProvisioningPolicy = {
    idpId: 'adfs',
    updateOnLogin: true,
    requiredClaims: ['sub', 'email'],
    attributes: [
      { target: 'username', source: 'email', transform: 'email-local', required: true },
      { target: 'email', source: 'email', transform: 'lowercase' },
      { target: 'dept', source: 'department', defaultValue: 'unknown' },
      { target: 'groups', source: 'groups', transform: 'split:comma' },
    ],
    roles: [
      { role: 'admin', claim: 'groups', contains: 'admins' },
      { role: 'user', claim: 'email' },
    ],
  };

  let provisioner: JitProvisioner;
  let now = 1_000_000;
  beforeEach(() => {
    now = 1_000_000;
    provisioner = new JitProvisioner(() => now);
    provisioner.registerPolicy(policy);
  });

  it('provisions on first login', () => {
    const r = provisioner.provision('adfs', 's1', {
      sub: 's1',
      email: 'Alice@Corp.com',
      department: 'eng',
      groups: ['admins', 'devs'],
    });
    expect(r.created).toBe(true);
    expect(r.account!.attributes.username).toBe('Alice');
    expect(r.account!.attributes.email).toBe('alice@corp.com');
    expect(r.account!.attributes.groups).toEqual(['admins', 'devs']);
    expect(r.account!.roles).toContain('admin');
    expect(r.account!.roles).toContain('user');
  });

  it('applies default values', () => {
    const r = provisioner.provision('adfs', 's2', { sub: 's2', email: 'b@c.com' });
    expect(r.account!.attributes.dept).toBe('unknown');
  });

  it('rejects provisioning missing required claims', () => {
    const r = provisioner.provision('adfs', 's3', { sub: 's3' }); // no email
    expect(r.created).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(provisioner.account('adfs', 's3')).toBeUndefined();
  });

  it('updates attributes on subsequent logins when updateOnLogin', () => {
    provisioner.provision('adfs', 's1', { sub: 's1', email: 'a@c.com', department: 'eng' });
    now += 1000;
    const r = provisioner.provision('adfs', 's1', { sub: 's1', email: 'a@c.com', department: 'ops' });
    expect(r.created).toBe(false);
    expect(r.account!.attributes.dept).toBe('ops');
    expect(r.account!.loginCount).toBe(2);
  });

  it('does not update attributes when updateOnLogin=false', () => {
    const p2: ProvisioningPolicy = { ...policy, idpId: 'okta', updateOnLogin: false };
    provisioner.registerPolicy(p2);
    provisioner.provision('okta', 's9', { sub: 's9', email: 'x@c.com', department: 'a' });
    const r = provisioner.provision('okta', 's9', { sub: 's9', email: 'x@c.com', department: 'b' });
    expect(r.account!.attributes.dept).toBe('a'); // frozen
  });

  it('fails on unregistered IdP', () => {
    const r = provisioner.provision('unknown-idp', 'x', {});
    expect(r.errors[0]).toContain('no provisioning policy');
  });
});

/* ---------------------------------------------------------------------- */
/* Audit trail                                                            */
/* ---------------------------------------------------------------------- */

describe('SsoAuditTrail', () => {
  let now = 1_000_000;
  let trail: SsoAuditTrail;

  beforeEach(() => {
    now = 1_000_000;
    trail = new SsoAuditTrail(() => now);
  });

  it('records events with hash chaining and verifies', () => {
    trail.record('login.success', 'u1', { idp: 'adfs' }, 'corr-1');
    trail.record('token.minted', 'u1', {}, 'corr-1');
    trail.record('logout', 'u1', {});
    expect(trail.length).toBe(3);
    expect(trail.verify()).toBe(-1);
  });

  it('detects tampering', () => {
    trail.record('login.success', 'u1');
    trail.record('logout', 'u1');
    // Tamper with a stored event's detail
    const ev = trail.query({})[0] as { detail: Record<string, string> };
    ev.detail = { forged: 'yes' };
    expect(trail.verify()).toBe(0);
  });

  it('queries by subject, type and correlation', () => {
    trail.record('login.success', 'u1', {}, 'c1');
    trail.record('token.minted', 'u1', {}, 'c1');
    trail.record('login.success', 'u2', {}, 'c2');
    expect(trail.query({ subject: 'u1' }).length).toBe(2);
    expect(trail.query({ type: 'login.success' }).length).toBe(2);
    expect(trail.query({ correlationId: 'c1' }).length).toBe(2);
    expect(trail.query({ subject: 'u1', type: 'token.minted' }).length).toBe(1);
  });

  it('queries by time range', () => {
    trail.record('login.success', 'u1');
    now += 1000;
    trail.record('logout', 'u1');
    expect(trail.query({ since: 1_000_500 }).length).toBe(1);
    expect(trail.query({ until: 1_000_000 }).length).toBe(1);
  });

  it('forwards events to a sink', () => {
    const seen: SsoEvent[] = [];
    const sink: IEventSink = { write: (e) => seen.push(e) };
    const t2 = new SsoAuditTrail(() => now, sink);
    t2.record('login.success', 'u1');
    expect(seen.length).toBe(1);
    expect(seen[0].type).toBe('login.success');
  });
});

/* ---------------------------------------------------------------------- */
/* Token exchange                                                         */
/* ---------------------------------------------------------------------- */

describe('TokenExchange', () => {
  let now = 1_000_000;
  const rng = new SeededRandomSource(5n);
  const policy = {
    trustedIssuers: ['sts.corp'],
    allowedAudiences: ['api.a', 'api.b'],
    allowDelegation: true,
    allowImpersonation: true,
    tokenTtlMs: 60_000,
  };
  let ex: TokenExchange;

  beforeEach(() => {
    now = 1_000_000;
    ex = new TokenExchange(policy, rng, () => now);
  });

  it('exchanges a token for a new audience', () => {
    const root = ex.mint('sts.corp', 'alice', 'sts.corp', ['read', 'write']);
    const r = ex.exchange({ subjectToken: root, audience: 'api.a' });
    expect('token' in r).toBe(true);
    const claims = ex.verify((r as { token: string }).token)!;
    expect(claims.aud).toBe('api.a');
    expect(claims.sub).toBe('alice');
  });

  it('rejects scope widening', () => {
    const root = ex.mint('sts.corp', 'alice', 'sts.corp', ['read']);
    const r = ex.exchange({ subjectToken: root, audience: 'api.a', scope: ['read', 'admin'] });
    expect('error' in r).toBe(true);
    expect((r as { error: string }).error).toContain('scope');
  });

  it('adds an act claim on delegation', () => {
    const root = ex.mint('sts.corp', 'alice', 'sts.corp', ['read']);
    const r = ex.exchange({ subjectToken: root, audience: 'api.a', actor: 'svc-b' });
    const claims = ex.verify((r as { token: string }).token)!;
    expect(claims.act).toEqual(['svc-b']);
  });

  it('enforces max delegation depth', () => {
    let tok = ex.mint('sts.corp', 'a', 'sts.corp', ['read']);
    for (let i = 0; i < 3; i++) {
      const r = ex.exchange({ subjectToken: tok, audience: 'api.a', actor: 'svc' + i });
      tok = (r as { token: string }).token;
    }
    const r4 = ex.exchange({ subjectToken: tok, audience: 'api.a', actor: 'svc3' });
    expect('error' in r4).toBe(true);
    expect((r4 as { error: string }).error).toContain('depth');
  });

  it('impersonates when allowed', () => {
    const root = ex.mint('sts.corp', 'admin', 'sts.corp', ['impersonate']);
    const r = ex.exchange({ subjectToken: root, audience: 'api.a', impersonate: 'bob' });
    const claims = ex.verify((r as { token: string }).token)!;
    expect(claims.sub).toBe('bob');
  });

  it('rejects untrusted issuers', () => {
    // Two exchanges sharing the secret but different trusted issuers.
    const sharedSecret = rng.bytes(32);
    const a = new TokenExchange({ ...policy, trustedIssuers: ['sts.corp'] }, rng, () => now, sharedSecret);
    const b = new TokenExchange({ ...policy, trustedIssuers: ['other'] }, rng, () => now, sharedSecret);
    const root = a.mint('sts.corp', 'a', 'sts.corp', ['read']);
    const r = b.exchange({ subjectToken: root, audience: 'api.a' });
    expect('error' in r).toBe(true);
    expect((r as { error: string }).error).toContain('untrusted');
  });

  it('rejects expired tokens', () => {
    const root = ex.mint('sts.corp', 'a', 'sts.corp', ['read'], 1000);
    now += 2000;
    const r = ex.exchange({ subjectToken: root, audience: 'api.a' });
    expect((r as { error: string }).error).toContain('expired');
  });

  it('revoked tokens fail verification', () => {
    const root = ex.mint('sts.corp', 'a', 'sts.corp', ['read']);
    const claims = ex.verify(root)!;
    ex.revoke(claims.jti);
    expect(ex.verify(root)).toBeNull();
  });
});
