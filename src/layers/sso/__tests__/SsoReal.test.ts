/**
 * SSO real implementation tests — SAML parsing stub, OIDC flow,
 * session tickets, SLO, attribute mapping, IdP registry.
 */

import { describe, expect, it } from 'bun:test';
import { SamlResponseParser } from '../federation/SamlResponseParser';
import { OidcFlow } from '../federation/OidcFlow';
import { IdpRegistry } from '../federation/IdpRegistry';
import { SessionTicketStore } from '../federation/SessionTicketStore';
import { SloCoordinator, SloTransport } from '../federation/SloCoordinator';
import { SsoEngine } from '../federation/SsoEngine';
import { AttributeMapper } from '../federation/AttributeMapper';
import { IdentityProvider, SsoFederationError } from '../federation/types';

const NOW = 1_700_000_000_000;
const NOW_S = Math.floor(NOW / 1000);

const SAML_IDP: IdentityProvider = {
  id: 'corp-saml',
  name: 'Corporate SAML',
  protocol: 'saml2',
  enabled: true,
  entityId: 'https://idp.corp.example/saml',
  ssoUrl: 'https://idp.corp.example/sso',
  sloUrl: 'https://idp.corp.example/slo',
  attributeMapping: [
    { source: 'mail', target: 'email' },
    { source: 'groups', target: 'roles', transform: 'split:comma' },
  ],
};

const OIDC_IDP: IdentityProvider = {
  id: 'google',
  name: 'Google',
  protocol: 'oidc',
  enabled: true,
  entityId: 'https://accounts.google.com',
  ssoUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  attributeMapping: [
    { source: 'email', target: 'email' },
    { source: 'name', target: 'displayName' },
  ],
};

function makeSamlResponse(overrides: Partial<Parameters<typeof SamlResponseParser.buildResponse>[0]> = {}) {
  return SamlResponseParser.buildResponse({
    issuer: SAML_IDP.entityId,
    nameId: 'alice@corp.example',
    attributes: {
      mail: ['alice@corp.example'],
      groups: ['admins,devs'],
    },
    notOnOrAfterMs: NOW + 300_000,
    sessionIndex: '_sess-123',
    ...overrides,
  });
}

function makeIdToken(claims: Record<string, unknown>): string {
  const enc = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc(claims)}.fakesig`;
}

describe('SamlResponseParser', () => {
  it('parses a valid response', () => {
    const encoded = makeSamlResponse();
    const r = SamlResponseParser.parse(encoded, { now: () => NOW });
    expect(r.nameId).toBe('alice@corp.example');
    expect(r.issuer).toBe(SAML_IDP.entityId);
    expect(r.attributes['mail']).toEqual(['alice@corp.example']);
    expect(r.attributes['groups']).toEqual(['admins,devs']);
    expect(r.sessionIndex).toBe('_sess-123');
    expect(r.signatureValid).toBe(true);
  });

  it('rejects expired assertions', () => {
    const encoded = makeSamlResponse({ notOnOrAfterMs: NOW - 1000 });
    expect(() => SamlResponseParser.parse(encoded, { now: () => NOW })).toThrow(SsoFederationError);
  });

  it('rejects not-yet-valid assertions', () => {
    const encoded = makeSamlResponse({ notBeforeMs: NOW + 60_000 });
    try {
      SamlResponseParser.parse(encoded, { now: () => NOW });
      expect.unreachable();
    } catch (e) {
      expect((e as SsoFederationError).code).toBe('assertion_not_yet_valid');
    }
  });

  it('enforces audience restriction', () => {
    const encoded = makeSamlResponse({ audience: 'https://sp.example.com' });
    expect(() =>
      SamlResponseParser.parse(encoded, { now: () => NOW, expectedAudience: 'https://other' })
    ).toThrow(SsoFederationError);
    expect(
      SamlResponseParser.parse(encoded, { now: () => NOW, expectedAudience: 'https://sp.example.com' }).audience
    ).toBe('https://sp.example.com');
  });
});

describe('AttributeMapper', () => {
  it('applies mappings with transforms', () => {
    const out = AttributeMapper.apply(
      { mail: 'USER@CORP.COM', groups: 'a,b,c', dept: 'Engineering' },
      [
        { source: 'mail', target: 'email', transform: 'lowercase' },
        { source: 'groups', target: 'roles', transform: 'split:comma' },
        { source: 'dept', target: 'dept' },
        { source: 'missing', target: 'nope' },
      ]
    );
    expect(out['email']).toBe('user@corp.com');
    expect(out['roles']).toEqual(['a', 'b', 'c']);
    expect(out['dept']).toBe('Engineering');
    expect('nope' in out).toBe(false);
  });
});

describe('IdpRegistry', () => {
  it('registers, resolves, disables, removes IdPs', () => {
    const reg = new IdpRegistry();
    reg.register(SAML_IDP);
    reg.register(OIDC_IDP);
    expect(reg.size).toBe(2);
    expect(reg.get('corp-saml').entityId).toBe(SAML_IDP.entityId);
    expect(reg.getByEntityId(SAML_IDP.entityId)?.id).toBe('corp-saml');
    reg.setEnabled('google', false);
    expect(() => reg.get('google')).toThrow(SsoFederationError);
    expect(reg.remove('google')).toBe(true);
    expect(reg.size).toBe(1);
  });

  it('rejects duplicate ids and entityIds', () => {
    const reg = new IdpRegistry();
    reg.register(SAML_IDP);
    expect(() => reg.register(SAML_IDP)).toThrow(SsoFederationError);
    expect(() =>
      reg.register({ ...SAML_IDP, id: 'other', entityId: SAML_IDP.entityId })
    ).toThrow(SsoFederationError);
  });
});

describe('OidcFlow', () => {
  const opts = { clientId: 'my-client', redirectUri: 'https://app.example/cb' };

  it('builds an authorization URL with PKCE', () => {
    const flow = new OidcFlow(OIDC_IDP, opts, { now: () => NOW });
    const { url, state, nonce, codeVerifier } = flow.startAuthorization();
    expect(url).toContain(OIDC_IDP.ssoUrl);
    expect(url).toContain('code_challenge=');
    expect(url).toContain('code_challenge_method=S256');
    expect(state).toHaveLength(32);
    expect(nonce).toHaveLength(32);
    expect(codeVerifier!.length).toBeGreaterThan(40);
  });

  it('rejects state mismatch (CSRF)', async () => {
    const flow = new OidcFlow(OIDC_IDP, opts, { now: () => NOW });
    const auth = flow.startAuthorization();
    await expect(
      flow.handleCallback({
        code: 'abc',
        state: 'wrong',
        expectedState: auth.state,
        nonce: auth.nonce,
        codeVerifier: auth.codeVerifier,
      })
    ).rejects.toThrow(SsoFederationError);
  });

  it('full OIDC flow with injected transport', async () => {
    const flow = new OidcFlow(OIDC_IDP, opts, { now: () => NOW });
    const auth = flow.startAuthorization();
    // Build id_token with the real nonce
    const realIdToken = makeIdToken({
      iss: OIDC_IDP.entityId,
      sub: 'oidc-user-1',
      aud: 'my-client',
      exp: NOW_S + 600,
      iat: NOW_S,
      nonce: auth.nonce,
      email: 'u@example.com',
    });
    const flow2 = new OidcFlow(
      OIDC_IDP,
      {
        ...opts,
        exchangeCode: async () => ({
          access_token: 'at-1',
          id_token: realIdToken,
          token_type: 'Bearer',
          expires_in: 300,
        }),
      },
      { now: () => NOW }
    );
    const res = await flow2.handleCallback({
      code: 'authcode',
      state: auth.state,
      expectedState: auth.state,
      nonce: auth.nonce,
      codeVerifier: auth.codeVerifier,
    });
    expect(res.claims.sub).toBe('oidc-user-1');
    expect(res.claims.email).toBe('u@example.com');
  });
});

describe('SessionTicketStore', () => {
  it('issues, consumes once, rejects replay', () => {
    const store = new SessionTicketStore({ now: () => NOW, ttlMs: 60_000 });
    const { token, ticket } = store.issue({ subject: 'u1', idpId: 'corp-saml' });
    expect(ticket.subject).toBe('u1');
    const consumed = store.consume(token);
    expect(consumed.subject).toBe('u1');
    expect(() => store.consume(token)).toThrow(SsoFederationError);
  });

  it('expires tickets', () => {
    let t = NOW;
    const store = new SessionTicketStore({ now: () => t, ttlMs: 1000 });
    const { token } = store.issue({ subject: 'u', idpId: 'x' });
    t += 2000;
    expect(() => store.consume(token)).toThrow(SsoFederationError);
  });
});

describe('SloCoordinator', () => {
  it('revokes local tickets and notifies IdPs', async () => {
    const tickets = new SessionTicketStore({ now: () => NOW });
    const reg = new IdpRegistry();
    reg.register(SAML_IDP);
    tickets.issue({ subject: 'alice', idpId: 'corp-saml', idpSessionIndex: 's1' });
    tickets.issue({ subject: 'alice', idpId: 'corp-saml', idpSessionIndex: 's2' });
    tickets.issue({ subject: 'bob', idpId: 'corp-saml', idpSessionIndex: 's3' });

    const sent: Array<{ idpId: string; sessionIndex?: string }> = [];
    const transport: SloTransport = {
      sendLogoutRequest: async (idp, p) => {
        sent.push({ idpId: idp.id, sessionIndex: p.sessionIndex });
        return true;
      },
    };
    const slo = new SloCoordinator(tickets, reg, transport);
    const res = await slo.logoutSubject('alice');
    expect(res.localTicketsRevoked).toBe(2);
    expect(res.idpsNotified).toEqual(['corp-saml']);
    expect(sent.length).toBe(1); // deduplicated
  });

  it('back-channel logout revokes by sessionIndex', async () => {
    const tickets = new SessionTicketStore({ now: () => NOW });
    const reg = new IdpRegistry();
    reg.register(SAML_IDP);
    tickets.issue({ subject: 'a', idpId: 'corp-saml', idpSessionIndex: 'sess-x' });
    tickets.issue({ subject: 'b', idpId: 'corp-saml', idpSessionIndex: 'sess-y' });
    const slo = new SloCoordinator(tickets, reg);
    const n = await slo.handleBackChannelLogout('corp-saml', 'sess-x');
    expect(n).toBe(1);
    expect(tickets.size).toBe(1);
  });
});

describe('SsoEngine', () => {
  it('consumes a SAML response end-to-end', () => {
    const engine = new SsoEngine({ now: () => NOW });
    engine.registry.register(SAML_IDP);
    const encoded = makeSamlResponse();
    const { ticket } = engine.consumeSaml(encoded);
    expect(ticket.subject).toBe('alice@corp.example');
    expect(ticket.attributes['email']).toBe('alice@corp.example');
    expect(ticket.attributes['roles']).toEqual(['admins', 'devs']);
  });

  it('rejects SAML for unknown issuer', () => {
    const engine = new SsoEngine({ now: () => NOW });
    const encoded = makeSamlResponse();
    expect(() => engine.consumeSaml(encoded)).toThrow(SsoFederationError);
  });
});
