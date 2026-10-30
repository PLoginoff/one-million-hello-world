/**
 * Tests for identity-provider engine2: ProtocolNegotiator,
 * AttributeTransformer, TokenBroker, ProvisioningWebhooks, IdpHealthMonitor.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  ProtocolNegotiator,
  FederationProtocol,
  detectProtocol,
  AttributeTransformer,
  expandTemplate,
  SAML_TO_OIDC_RULES,
  TokenBroker,
  ProvisioningWebhookDispatcher,
  InMemoryWebhookTransport,
  signBody,
  verifySignature,
  IdpHealthMonitor,
  EndpointHealth,
} from '../index';
import type { MonitoredEndpoint } from '../index';

let clock: number;
const now = () => clock;

describe('detectProtocol / ProtocolNegotiator', () => {
  beforeEach(() => {
    clock = 1_000;
  });

  it('detects OIDC vs SAML request shapes', () => {
    expect(detectProtocol({ hasOidcParams: true, hasSamlRequest: false, scopes: ['openid'], responseType: 'code' })).toBe(FederationProtocol.OIDC);
    expect(detectProtocol({ hasOidcParams: false, hasSamlRequest: true, scopes: [] })).toBe(FederationProtocol.SAML2);
    expect(detectProtocol({ hasOidcParams: false, hasSamlRequest: false, scopes: [] })).toBeUndefined();
  });

  it('negotiates the native protocol when the partner supports it', () => {
    const neg = new ProtocolNegotiator();
    neg.registerPartner({ entityId: 'sp1', protocols: [FederationProtocol.SAML2, FederationProtocol.OIDC], oidcGrants: ['authorization_code'], samlBindings: ['HTTP-POST'] });
    const r = neg.negotiate('sp1', { hasOidcParams: true, hasSamlRequest: false, scopes: [], responseType: 'code' });
    expect(r.ok).toBe(true);
    expect(r.protocol).toBe(FederationProtocol.OIDC);
    expect(r.binding).toBe('authorization_code');
  });

  it('falls back through IdP preference when native is unsupported', () => {
    const neg = new ProtocolNegotiator([FederationProtocol.OIDC, FederationProtocol.SAML2]);
    neg.registerPartner({ entityId: 'sp2', protocols: [FederationProtocol.SAML2], oidcGrants: [], samlBindings: ['HTTP-Redirect'] });
    // Partner can't do OIDC even though the request looks OIDC.
    const r = neg.negotiate('sp2', { hasOidcParams: true, hasSamlRequest: false, scopes: [], responseType: 'code' });
    expect(r.ok).toBe(true);
    expect(r.protocol).toBe(FederationProtocol.SAML2);
    expect(r.binding).toBe('HTTP-Redirect');
  });

  it('negotiates the common protocol even outside IdP preference', () => {
    // IdP prefers SAML2 but also allows OIDC; partner only speaks OIDC.
    const neg = new ProtocolNegotiator([FederationProtocol.SAML2, FederationProtocol.OIDC]);
    neg.registerPartner({ entityId: 'sp3', protocols: [FederationProtocol.OIDC], oidcGrants: ['authorization_code'], samlBindings: [] });
    const r = neg.negotiate('sp3', { hasOidcParams: true, hasSamlRequest: false, scopes: [], responseType: 'code' });
    expect(r.ok).toBe(true);
    expect(r.protocol).toBe(FederationProtocol.OIDC);
  });

  it('fails when the partner speaks a protocol the IdP does not support', () => {
    // IdP strictly SAML2-only; partner strictly OIDC-only and request is SAML.
    const neg = new ProtocolNegotiator([FederationProtocol.SAML2]);
    neg.registerPartner({ entityId: 'sp4', protocols: [FederationProtocol.OIDC], oidcGrants: ['authorization_code'], samlBindings: [] });
    // SAML request detected but unsupported; preference pass hits OIDC
    // which is not in the IdP's preference list → no common protocol.
    const r = neg.negotiate('sp4', { hasOidcParams: false, hasSamlRequest: true, scopes: [] });
    expect(r.ok).toBe(false);
    expect(r.reason).toBeTruthy();
  });
});

describe('AttributeTransformer', () => {
  it('renames, maps via regex, templates, and drops', () => {
    const t = new AttributeTransformer([
      { kind: 'rename', from: 'mail', to: 'email' },
      { kind: 'map', attribute: 'email', pattern: '^(.+)@corp\\.local$', replace: '$1@corp.com' },
      { kind: 'template', attribute: 'display', template: '{first} {last}' },
      { kind: 'drop', attribute: 'internal_note' },
    ]);
    const r = t.transform({
      mail: ['jane@corp.local'],
      first: ['Jane'],
      last: ['Doe'],
      internal_note: ['x'],
    });
    expect(r.errors).toHaveLength(0);
    expect(r.attributes['email']).toEqual(['jane@corp.com']);
    expect(r.attributes['display']).toEqual(['Jane Doe']);
    expect(r.attributes['internal_note']).toBeUndefined();
    expect(r.attributes['mail']).toBeUndefined();
  });

  it('filters values and drops empty attributes', () => {
    const t = new AttributeTransformer([{ kind: 'filter', attribute: 'groups', pattern: '^admins' }]);
    const r = t.transform({ groups: ['admins-eu', 'users', 'admins-us'] });
    expect(r.attributes['groups']).toEqual(['admins-eu', 'admins-us']);
    const r2 = new AttributeTransformer([{ kind: 'filter', attribute: 'groups', pattern: 'zzz' }]).transform({ groups: ['a'] });
    expect(r2.attributes['groups']).toBeUndefined();
  });

  it('template expansion joins multi-valued attrs and blanks unknowns', () => {
    expect(expandTemplate('{a}-{b}-{c}', { a: ['x', 'y'], b: ['z'] })).toBe('x, y-z-');
  });

  it('preset SAML→OIDC rules map urn:oid attributes', () => {
    const t = new AttributeTransformer(SAML_TO_OIDC_RULES);
    const r = t.transform({
      'urn:oid:0.9.2342.19200300.100.1.3': ['a@b.c'],
      'urn:oid:1.3.6.1.4.1.5923.1.1.1.6': ['jdoe@university.edu'],
    });
    expect(r.attributes['email']).toEqual(['a@b.c']);
    expect(r.attributes['edu_person_principal_name']).toEqual(['jdoe']);
  });
});

describe('TokenBroker', () => {
  let broker: TokenBroker;
  const secret = Buffer.alloc(32, 7);

  beforeEach(() => {
    clock = 10_000;
    broker = new TokenBroker(now);
    broker.trustIssuer('idp-a', secret);
    broker.trustIssuer('broker', secret);
    broker.allowScopes('svc-b', ['read', 'write']);
  });

  it('issues, verifies and rejects tampered tokens', () => {
    const t = broker.issue('idp-a', 'user1', ['svc-x'], ['read']);
    expect(broker.verify(t.wire).sub).toBe('user1');
    const tampered = t.wire.slice(0, -2) + 'xx';
    expect(() => broker.verify(tampered)).toThrow(/signature/);
  });

  it('rejects expired tokens', () => {
    const t = broker.issue('idp-a', 'u', ['a'], [], 100);
    clock += 101;
    expect(() => broker.verify(t.wire)).toThrow(/expired/);
  });

  it('exchange intersects scopes and records the act chain', () => {
    const subject = broker.issue('idp-a', 'user1', ['broker'], ['read', 'write', 'admin']);
    const out = broker.exchange('broker', { subjectWire: subject.wire, audience: 'svc-b', scopes: ['read', 'admin'] });
    expect(out.token.scopes).toEqual(['read']); // admin not allowed for svc-b
    expect(out.token.act).toHaveLength(1);
    expect(out.token.act[0]?.iss).toBe('idp-a');

    const entry = broker.audit[broker.audit.length - 1];
    expect(entry?.grantedScopes).toEqual(['read']);
    expect(entry?.deniedScopes).toEqual(['admin']);
  });

  it('supports delegation chains across exchanges', () => {
    broker.allowScopes('svc-c', ['read']);
    const t1 = broker.issue('idp-a', 'u1', ['broker'], ['read']);
    const t2 = broker.exchange('broker', { subjectWire: t1.wire, audience: 'svc-b' });
    const t3 = broker.exchange('broker', { subjectWire: t2.wire, audience: 'svc-c' });
    expect(t3.token.act).toHaveLength(2);
    expect(t3.token.act[1]?.iss).toBe('broker');
  });
});

describe('ProvisioningWebhooks', () => {
  let transport: InMemoryWebhookTransport;
  let dispatcher: ProvisioningWebhookDispatcher;

  beforeEach(() => {
    clock = 50_000;
    transport = new InMemoryWebhookTransport();
    dispatcher = new ProvisioningWebhookDispatcher(transport, { maxAttempts: 3, backoffBaseMs: 100 }, now);
  });

  it('fans out signed deliveries to matching subscribers', async () => {
    const s = dispatcher.subscribe('https://hr.example.com/hook', ['user.created'], 'secret1');
    dispatcher.subscribe('https://audit.example.com', ['*'], 'secret2');
    const ids = dispatcher.emit('user.created', 'u1', { snapshot: { name: 'Jane' } });
    expect(ids).toHaveLength(2);
    const res = await dispatcher.flush();
    expect(res.delivered).toBe(2);
    const body = transport.sent[0]?.delivery.body ?? '';
    expect(verifySignature('secret1', body, transport.sent[0]!.delivery.signature)).toBe(true);
    void s;
  });

  it('retries with backoff then dead-letters', async () => {
    dispatcher.subscribe('https://x', ['*'], 's');
    dispatcher.emit('user.deleted', 'u1');
    transport.failNext = 10; // all attempts fail
    await dispatcher.flush(); // attempt 1
    clock += 200;
    await dispatcher.flush(); // attempt 2 (backoff 100ms elapsed)
    clock += 400;
    const res = await dispatcher.flush(); // attempt 3 → dead
    expect(res.deadLettered).toBe(1);
    expect(dispatcher.deadLettered).toHaveLength(1);
  });

  it('preserves per-subscriber ordering on failure', async () => {
    dispatcher.subscribe('https://x', ['*'], 's');
    dispatcher.emit('user.created', 'u1');
    dispatcher.emit('user.deleted', 'u1');
    transport.failNext = 1;
    await dispatcher.flush(); // first fails, second must NOT overtake
    expect(transport.sent).toHaveLength(0);
    clock += 200;
    await dispatcher.flush();
    const types = transport.sent.map((d) => d.delivery.event.type);
    expect(types).toEqual(['user.created', 'user.deleted']);
  });
});

describe('IdpHealthMonitor', () => {
  let monitor: IdpHealthMonitor;
  const ep: MonitoredEndpoint = { id: 'e1', entityId: 'idp-x', url: 'https://x/sso', kind: 'sso' };

  const ok = (ms = 10): { ok: true; latencyMs: number; status: number; at: number } => ({ ok: true, latencyMs: ms, status: 200, at: clock });
  const bad = (): { ok: false; latencyMs: number; status: number; at: number } => ({ ok: false, latencyMs: 0, status: 503, at: clock });

  beforeEach(() => {
    clock = 1_000;
    monitor = new IdpHealthMonitor({ windowSize: 10, downAfterConsecutive: 3, degradedRatio: 0.3, recoverAfterConsecutive: 2 }, undefined, now);
    monitor.watch(ep);
  });

  it('transitions UNKNOWN → HEALTHY → DOWN on failures', () => {
    expect(monitor.status('e1')?.health).toBe(EndpointHealth.UNKNOWN);
    monitor.record('e1', ok());
    expect(monitor.status('e1')?.health).toBe(EndpointHealth.HEALTHY);
    monitor.record('e1', bad());
    monitor.record('e1', bad());
    monitor.record('e1', bad());
    expect(monitor.status('e1')?.health).toBe(EndpointHealth.DOWN);
  });

  it('DOWN needs consecutive successes to recover (hysteresis)', () => {
    for (let i = 0; i < 3; i++) monitor.record('e1', bad());
    expect(monitor.status('e1')?.health).toBe(EndpointHealth.DOWN);
    monitor.record('e1', ok());
    expect(monitor.status('e1')?.health).toBe(EndpointHealth.DOWN); // 1 success insufficient
    monitor.record('e1', ok());
    expect(monitor.status('e1')?.health).toBe(EndpointHealth.HEALTHY);
  });

  it('mixed failures degrade without downing', () => {
    for (let i = 0; i < 6; i++) monitor.record('e1', ok());
    monitor.record('e1', bad());
    monitor.record('e1', bad());
    monitor.record('e1', ok());
    monitor.record('e1', bad());
    const st = monitor.status('e1');
    expect(st?.health).toBe(EndpointHealth.DEGRADED);
    expect(st?.consecutiveFailures).toBe(1);
  });

  it('EWMA latency tracks successful probes', () => {
    monitor.record('e1', ok(100));
    monitor.record('e1', ok(200));
    const st = monitor.status('e1');
    expect(st?.ewmaLatencyMs).toBeCloseTo(0.3 * 200 + 0.7 * 100, 5);
  });

  it('partnerHealth rolls up worst-case per entity', () => {
    monitor.watch({ id: 'e2', entityId: 'idp-x', url: 'https://x/jwks', kind: 'jwks' });
    monitor.record('e1', ok());
    for (let i = 0; i < 3; i++) monitor.record('e2', bad());
    expect(monitor.partnerHealth('idp-x')).toBe(EndpointHealth.DOWN);
  });
});
