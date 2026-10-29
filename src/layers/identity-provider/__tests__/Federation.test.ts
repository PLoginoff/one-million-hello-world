/**
 * Federation tests — metadata, keys, NameID, attribute release,
 * OIDC-ish flow, SAML-ish flow, JIT provisioning, SLO.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { FederationEngine } from '../federation/FederationEngine';
import { KeyResolver, canonicalize } from '../federation/KeyResolver';
import { MetadataStore } from '../federation/MetadataStore';
import { AttributeReleaseEngine } from '../federation/AttributeReleaseEngine';
import { NameIdMapper } from '../federation/NameIdMapper';
import { SamlAdapter } from '../federation/SamlAdapter';
import {
  EntityMetadata,
  NameIdFormat,
  FederationError,
  FederationErrorCode,
  SamlLogoutMessage,
} from '../federation/types';

function spMetadata(entityId: string, nameIdFormats = [NameIdFormat.PERSISTENT, NameIdFormat.EMAIL]): EntityMetadata {
  return {
    entityId,
    role: 'sp',
    displayName: 'Test SP',
    ssoEndpoints: [{ binding: 'redirect', location: `${entityId}/acs` }],
    sloEndpoints: [{ binding: 'redirect', location: `${entityId}/slo` }],
    signingKeys: [{ kty: 'oct', kid: `${entityId}-k1`, k: 'sp-secret' }],
    nameIdFormats,
    attributes: ['email', 'name'],
    certificates: ['CERT-STUB'],
  };
}

function makeEngine(now?: () => number): { engine: FederationEngine; sp: EntityMetadata } {
  const engine = new FederationEngine({ idpEntityId: 'https://idp.example.com' }, undefined, now);
  engine.publishSelfMetadata({
    displayName: 'Local IdP',
    ssoEndpoints: [{ binding: 'redirect', location: 'https://idp.example.com/sso' }],
    sloEndpoints: [{ binding: 'redirect', location: 'https://idp.example.com/slo' }],
    signingKeys: [{ kty: 'oct', kid: 'idp-k1', k: 'idp-signing-secret', use: 'sig' }],
    nameIdFormats: [NameIdFormat.PERSISTENT, NameIdFormat.EMAIL, NameIdFormat.TRANSIENT],
    attributes: ['email', 'name', 'groups'],
    certificates: ['IDP-CERT-STUB'],
  });
  const sp = spMetadata('https://sp.example.com');
  engine.establishTrust({
    metadata: sp,
    attributePolicy: {
      id: 'sp-policy',
      rules: [
        { attribute: 'email', action: 'release' },
        { attribute: 'name', action: 'release' },
        { attribute: 'groups.*', action: 'release', values: ['eng', 'ops'] },
        { attribute: 'ssn', action: 'deny' },
      ],
    },
  });
  engine.registerAccount({
    userId: 'user-1',
    email: 'alice@corp.example',
    attributes: {
      email: ['alice@corp.example'],
      name: ['Alice A.'],
      'groups.membership': ['eng', 'secret-team'],
      ssn: ['000-00-0000'],
    },
  });
  return { engine, sp };
}

describe('KeyResolver', () => {
  it('signs and verifies round-trip', () => {
    const keys = new KeyResolver();
    keys.publishKeys('e1', [{ kty: 'oct', kid: 'k1', k: 'secret', use: 'sig' }]);
    const sig = keys.sign('e1', 'HS256-stub', { a: 1, b: 'x' });
    expect(keys.verify('e1', 'k1', { a: 1, b: 'x' }, sig.value)).toBe(true);
    expect(keys.verify('e1', 'k1', { a: 2, b: 'x' }, sig.value)).toBe(false);
  });

  it('canonicalize sorts keys', () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
  });

  it('rollover retires old sig keys; old signatures still verify, new sign with new kid', () => {
    const keys = new KeyResolver();
    keys.publishKeys('e1', [{ kty: 'oct', kid: 'old', k: 's1', use: 'sig' }]);
    const sig1 = keys.sign('e1', 'a', 'payload');
    expect(sig1.kid).toBe('old');
    keys.rollover('e1', { kty: 'oct', kid: 'new', k: 's2', use: 'sig' });
    const sig2 = keys.sign('e1', 'a', 'payload');
    expect(sig2.kid).toBe('new');
    // Old key still resolves for verification of old signatures.
    expect(keys.verify('e1', 'old', 'payload', sig1.value)).toBe(true);
    expect(keys.verify('e1', 'new', 'payload', sig2.value)).toBe(true);
  });

  it('expired keys cannot sign/verify', () => {
    const keys = new KeyResolver();
    keys.publishKeys('e1', [{ kty: 'oct', kid: 'k1', k: 's', expiresAt: 1_000 }]);
    expect(() => keys.resolveForSign('e1', 2_000)).toThrow(FederationError);
    expect(() => keys.resolveForVerify('e1', 'k1', 2_000)).toThrow(FederationError);
  });
});

describe('MetadataStore', () => {
  it('publishes, requires, and expires documents', () => {
    const m = new MetadataStore();
    m.publish(spMetadata('e1'));
    expect(m.require('e1').entityId).toBe('e1');
    m.publish({ ...spMetadata('e2'), validUntil: 500 });
    expect(() => m.require('e2', 501)).toThrowError(
      expect.objectContaining({ code: FederationErrorCode.UNKNOWN_ENTITY })
    );
    expect(m.sweep(501)).toBe(1);
  });

  it('exports canonical docs with fingerprint; import verifies it', () => {
    const m = new MetadataStore();
    m.publish(spMetadata('e1'));
    const { body, fingerprint } = m.exportDocument('e1');
    const doc = m.importDocument(body, fingerprint);
    expect(doc.entityId).toBe('e1');
    expect(() => m.importDocument(body, 'badfingerprint')).toThrow(FederationError);
    // Same doc re-exported has stable fingerprint
    expect(m.exportDocument('e1').fingerprint).toBe(fingerprint);
  });
});

describe('AttributeReleaseEngine', () => {
  it('applies ordered rules with wildcard and value filters', () => {
    const e = new AttributeReleaseEngine();
    e.registerPolicy({
      id: 'p1',
      rules: [
        { attribute: 'email', action: 'release' },
        { attribute: 'groups.*', action: 'release', values: ['eng'] },
        { attribute: 'dept', action: 'deny' },
      ],
    });
    const out = e.release('p1', {
      email: ['a@b.c'],
      'groups.membership': ['eng', 'finance'],
      dept: ['IT'],
      other: ['x'],
    });
    expect(out.email).toEqual(['a@b.c']);
    expect(out['groups.membership']).toEqual(['eng']);
    expect(out.dept).toBeUndefined();
    expect(out.other).toBeUndefined(); // default deny
  });

  it('default release set used when no policy bound', () => {
    const e = new AttributeReleaseEngine();
    const out = e.release(undefined, { email: ['a@b.c'], name: ['A'], secret: ['s'] });
    expect(out).toEqual({ email: ['a@b.c'], name: ['A'] });
  });

  it('deny with value filter removes only those values', () => {
    const e = new AttributeReleaseEngine();
    e.registerPolicy({
      id: 'p2',
      rules: [{ attribute: 'roles', action: 'deny', values: ['admin'] }],
    });
    const out = e.release('p2', { roles: ['admin', 'user'] });
    expect(out.roles).toEqual(['user']);
  });
});

describe('NameIdMapper', () => {
  it('persistent nameids are stable per (user, sp) and resolvable', () => {
    const m = new NameIdMapper('salt-1');
    const a = m.issue('u1', 'spA', 'idp', NameIdFormat.PERSISTENT, [NameIdFormat.PERSISTENT]);
    const b = m.issue('u1', 'spA', 'idp', NameIdFormat.PERSISTENT, [NameIdFormat.PERSISTENT]);
    expect(a.nameId).toBe(b.nameId);
    expect(m.resolve(a.nameId)).toEqual({ userId: 'u1', spEntityId: 'spA' });
    // Different SP => different pseudonym (unlinkability)
    const c = m.issue('u1', 'spB', 'idp', NameIdFormat.PERSISTENT, [NameIdFormat.PERSISTENT]);
    expect(c.nameId).not.toBe(a.nameId);
  });

  it('transient nameids differ each issue', () => {
    const m = new NameIdMapper();
    const a = m.issue('u1', 'sp', 'idp', NameIdFormat.TRANSIENT, [NameIdFormat.TRANSIENT]);
    const b = m.issue('u1', 'sp', 'idp', NameIdFormat.TRANSIENT, [NameIdFormat.TRANSIENT]);
    expect(a.nameId).not.toBe(b.nameId);
  });

  it('negotiates requested format when supported, else falls back', () => {
    const m = new NameIdMapper();
    const r = m.issue('u1', 'sp', 'idp', NameIdFormat.EMAIL, [NameIdFormat.PERSISTENT], 'a@b.c');
    expect(r.format).toBe(NameIdFormat.PERSISTENT);
    const r2 = m.issue('u1', 'sp', 'idp', NameIdFormat.EMAIL, [NameIdFormat.EMAIL, NameIdFormat.PERSISTENT], 'a@b.c');
    expect(r2.format).toBe(NameIdFormat.EMAIL);
    expect(r2.nameId).toBe('a@b.c');
  });
});

describe('SamlAdapter', () => {
  it('builds AuthnRequest and parses a raw copy', () => {
    const adapter = new SamlAdapter(new KeyResolver());
    const req = adapter.buildAuthnRequest({
      issuer: 'sp', acsUrl: 'https://sp/acs', nameIdFormat: NameIdFormat.PERSISTENT, relayState: 'rs',
    });
    const parsed = adapter.parseAuthnRequest({ ...(req as unknown as Record<string, unknown>) });
    expect(parsed.id).toBe(req.id);
    expect(parsed.relayState).toBe('rs');
  });

  it('rejects malformed AuthnRequest', () => {
    const adapter = new SamlAdapter(new KeyResolver());
    expect(() => adapter.parseAuthnRequest({ id: 'x' })).toThrow(FederationError);
  });
});

/**
 * Build an SP-side engine that trusts the IdP's metadata — the half
 * that consumes assertions and JIT-provisions local shadow users.
 */
function makeSpEngine(idp: FederationEngine, spEntityId: string, jit = true): FederationEngine {
  const { body } = idp.metadata.exportDocument('https://idp.example.com');
  const idpMeta = idp.metadata.importDocument(body);
  const spEngine = new FederationEngine({ idpEntityId: spEntityId });
  spEngine.publishSelfMetadata({
    ssoEndpoints: [],
    sloEndpoints: [{ binding: 'redirect', location: `${spEntityId}/slo` }],
    signingKeys: [{ kty: 'oct', kid: `${spEntityId}-k`, k: 'sp-secret' }],
    nameIdFormats: [NameIdFormat.PERSISTENT],
    attributes: [],
    certificates: [],
  });
  spEngine.establishTrust({ metadata: idpMeta, jitProvisioning: jit });
  return spEngine;
}

describe('FederationEngine SAML SSO flow', () => {
  let engine: FederationEngine;
  let sp: EntityMetadata;
  beforeEach(() => { ({ engine, sp } = makeEngine()); });

  it('issues a signed, policy-filtered response and the SP can consume it', () => {
    const req = engine.saml.buildAuthnRequest({ issuer: sp.entityId, acsUrl: `${sp.entityId}/acs` });
    const resp = engine.handleAuthnRequest(req, 'user-1');
    expect(resp.status).toBe('Success');
    expect(resp.inResponseTo).toBe(req.id);

    const spEngine = makeSpEngine(engine, sp.entityId);
    const { identity, provisioned } = spEngine.consumeResponse(resp, req.id, sp.entityId);
    expect(identity.idpEntityId).toBe('https://idp.example.com');
    expect(identity.nameIdFormat).toBe(NameIdFormat.PERSISTENT);
    // Policy filtered: groups.* wildcard kept only 'eng'; ssn denied.
    expect(identity.attributes.email).toEqual(['alice@corp.example']);
    expect(identity.attributes['groups.membership']).toEqual(['eng']);
    expect(identity.attributes.ssn).toBeUndefined();
    // JIT provisioning created a shadow user
    expect(provisioned?.justCreated).toBe(true);
    // Second login returns existing record
    const resp2 = engine.handleAuthnRequest(
      engine.saml.buildAuthnRequest({ issuer: sp.entityId, acsUrl: `${sp.entityId}/acs` }),
      'user-1'
    );
    const again = spEngine.consumeResponse(resp2);
    expect(again.provisioned?.justCreated).toBe(false);
    expect(again.provisioned?.id).toBe(provisioned?.id);
  });

  it('rejects response for untrusted issuer', () => {
    expect(() =>
      engine.handleAuthnRequest(
        engine.saml.buildAuthnRequest({ issuer: 'https://evil.example.com', acsUrl: 'https://evil/acs' }),
        'user-1'
      )
    ).toThrowError(expect.objectContaining({ code: FederationErrorCode.UNKNOWN_ENTITY }));
  });

  it('detects assertion tampering', () => {
    const req = engine.saml.buildAuthnRequest({ issuer: sp.entityId, acsUrl: `${sp.entityId}/acs` });
    const resp = engine.handleAuthnRequest(req, 'user-1');
    const spEngine = makeSpEngine(engine, sp.entityId);
    const tampered = {
      ...resp,
      assertion: { ...resp.assertion!, attributes: { ssn: ['999'] } },
    };
    expect(() => spEngine.consumeResponse(tampered, req.id, sp.entityId)).toThrowError(
      expect.objectContaining({ code: FederationErrorCode.INVALID_SIGNATURE })
    );
  });

  it('detects expired assertions', () => {
    let now = 1_000_000;
    ({ engine, sp } = makeEngine(() => now));
    const req = engine.saml.buildAuthnRequest({ issuer: sp.entityId, acsUrl: `${sp.entityId}/acs` });
    const resp = engine.handleAuthnRequest(req, 'user-1');
    const spEngine = makeSpEngine(engine, sp.entityId);
    now += 10 * 60 * 1000; // past default 5-min TTL + skew
    expect(() => spEngine.consumeResponse(resp, req.id, sp.entityId)).toThrowError(
      expect.objectContaining({ code: FederationErrorCode.ASSERTION_EXPIRED })
    );
  });
});

describe('FederationEngine OIDC-ish flow', () => {
  it('authorization-code round trip with PKCE', () => {
    const { engine } = makeEngine();
    const req = engine.oidc.buildAuthorizationRequest({
      clientId: 'app-1', redirectUri: 'https://app/cb', scope: ['openid', 'email'], pkce: true,
    });
    const verifier = (req as unknown as { _verifier: string })._verifier;
    const code = engine.oidc.issueAuthorizationCode(req, 'user-1');
    const tokens = engine.oidc.exchangeCode(code, 'app-1', 'https://app/cb', verifier);
    expect(tokens.tokenType).toBe('Bearer');
    const claims = engine.oidc.parseIdToken(tokens.idToken, 'app-1');
    expect(claims.sub).toBe('user-1');
    expect(claims.iss).toBe('https://idp.example.com');
  });

  it('rejects code reuse and PKCE failure', () => {
    const { engine } = makeEngine();
    const req = engine.oidc.buildAuthorizationRequest({
      clientId: 'app-1', redirectUri: 'https://app/cb', scope: ['openid'], pkce: true,
    });
    const verifier = (req as unknown as { _verifier: string })._verifier;
    const code = engine.oidc.issueAuthorizationCode(req, 'user-1');
    expect(() => engine.oidc.exchangeCode(code, 'app-1', 'https://app/cb', 'wrong'))
      .toThrowError(expect.objectContaining({ code: FederationErrorCode.STATE_MISMATCH }));
    engine.oidc.exchangeCode(code, 'app-1', 'https://app/cb', verifier);
    expect(() => engine.oidc.exchangeCode(code, 'app-1', 'https://app/cb', verifier))
      .toThrowError(expect.objectContaining({ code: FederationErrorCode.TOKEN_INVALID }));
  });

  it('rejects redirect_uri mismatch', () => {
    const { engine } = makeEngine();
    const req = engine.oidc.buildAuthorizationRequest({
      clientId: 'app-1', redirectUri: 'https://app/cb', scope: ['openid'],
    });
    const code = engine.oidc.issueAuthorizationCode(req, 'user-1');
    expect(() => engine.oidc.exchangeCode(code, 'app-1', 'https://evil/cb'))
      .toThrowError(expect.objectContaining({ code: FederationErrorCode.STATE_MISMATCH }));
  });
});

describe('FederationEngine SLO', () => {
  it('propagates logout to session participants', () => {
    const { engine, sp } = makeEngine();
    // Establish session via SSO
    const req = engine.saml.buildAuthnRequest({ issuer: sp.entityId, acsUrl: `${sp.entityId}/acs` });
    const resp = engine.handleAuthnRequest(req, 'user-1');
    const spEngine = makeSpEngine(engine, sp.entityId);
    const { identity } = spEngine.consumeResponse(resp);
    expect(engine.sessionCount()).toBe(1);

    const delivered: SamlLogoutMessage[] = [];
    const result = engine.initiateSlo(identity.sessionIndex, identity.nameId, (_eid, msg) => {
      delivered.push(msg);
      return true;
    });
    expect(result.propagated).toHaveLength(1);
    expect(result.propagated[0].ok).toBe(true);
    expect(delivered[0].sessionIndex).toBe(identity.sessionIndex);
    expect(engine.sessionCount()).toBe(0);
  });

  it('handles inbound SLO requests by clearing matching sessions', () => {
    const { engine, sp } = makeEngine();
    const req = engine.saml.buildAuthnRequest({ issuer: sp.entityId, acsUrl: `${sp.entityId}/acs` });
    const resp = engine.handleAuthnRequest(req, 'user-1');
    const spEngine = makeSpEngine(engine, sp.entityId);
    const { identity } = spEngine.consumeResponse(resp);

    const inbound = engine.saml.buildLogoutMessage({
      issuer: sp.entityId,
      destination: 'https://idp.example.com/slo',
      nameId: identity.nameId,
      sessionIndex: identity.sessionIndex,
    });
    const reply = engine.handleLogoutRequest(inbound);
    expect(reply.status).toBe('Success');
    expect(engine.sessionCount()).toBe(0);
  });
});
