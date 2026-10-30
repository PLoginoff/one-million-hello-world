/**
 * Tests for TokenExchangeGrant (RFC 8693) and PushedAuthorization (RFC 9126).
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ClientRegistry } from '../../core/ClientRegistry';
import { TokenStore } from '../../core/TokenStore';
import { OAuth2Error } from '../../core/types';
import { TokenExchangeGrant } from '../TokenExchangeGrant';
import { PushedAuthorization } from '../PushedAuthorization';
import {
  GRANT_TOKEN_EXCHANGE,
  TOKEN_TYPE_ACCESS,
  ManualOAuthClock2,
} from '../types';

describe('TokenExchangeGrant', () => {
  let clients: ClientRegistry;
  let tokens: TokenStore;
  let grant: TokenExchangeGrant;
  let clock: ManualOAuthClock2;
  let subjectToken: string;

  beforeEach(() => {
    clock = new ManualOAuthClock2(1_000_000);
    clients = new ClientRegistry({ now: () => clock.now() });
    tokens = new TokenStore({ now: () => clock.now() });
    grant = new TokenExchangeGrant(clients, tokens);

    // Secret is stored by ClientRegistry; tests authenticate with any
    // value via registerConfidential's returned secret — captured here.
    const reg = clients.registerConfidential('api-client', {
      allowedGrantTypes: [GRANT_TOKEN_EXCHANGE as never],
      allowedScopes: ['read', 'write'],
      secret: 'x',
    });
    void reg;
    void clients.registerConfidential('delegator', {
      allowedGrantTypes: [GRANT_TOKEN_EXCHANGE as never],
      allowedScopes: ['read'],
      secret: 'x',
    });

    // A subject token issued to some earlier flow.
    const at = tokens.mintAccessToken({
      clientId: 'upstream',
      subject: 'user-42',
      scope: ['read', 'write', 'delete'],
      ttlSeconds: 3600,
    });
    subjectToken = at.token;
  });

  const baseReq = () => ({
    grant_type: GRANT_TOKEN_EXCHANGE,
    subject_token: subjectToken,
    subject_token_type: TOKEN_TYPE_ACCESS,
  });

  it('issues an exchange token with narrowed scope', () => {
    const out = grant.execute({ ...baseReq(), scope: 'read' }, 'api-client', 'x');
    expect(out.response.issued_token_type).toBe(TOKEN_TYPE_ACCESS);
    expect(out.response.scope).toBe('read');
    expect(out.subject).toBe('user-42');
    const introspected = tokens.requireAccessToken(out.response.access_token);
    expect(introspected.clientId).toBe('api-client');
    expect(introspected.subject).toBe('user-42');
  });

  it('defaults to subject scope ∩ client-allowed scope', () => {
    // api-client allows read+write → 'delete' drops out.
    const out = grant.execute(baseReq(), 'api-client', 'x');
    expect(out.response.scope).toBe('read write');
  });

  it('rejects scope escalation beyond the subject token', () => {
    expect(() =>
      grant.execute({ ...baseReq(), scope: 'admin' }, 'api-client', 'x')
    ).toThrow(OAuth2Error);
    try {
      grant.execute({ ...baseReq(), scope: 'admin' }, 'api-client', 'x');
    } catch (e) {
      expect((e as OAuth2Error).code).toBe('invalid_scope');
    }
  });

  it('rejects scope the client is not allowed', () => {
    // delegator only allows 'read'; 'write' is within subject scope but not client's.
    expect(() =>
      grant.execute({ ...baseReq(), scope: 'write' }, 'delegator', 'x')
    ).toThrow(OAuth2Error);
  });

  it('rejects unknown subject tokens', () => {
    expect(() =>
      grant.execute({ ...baseReq(), subject_token: 'bogus' }, 'api-client', 'x')
    ).toThrow(OAuth2Error);
  });

  it('rejects non-access-token subject types', () => {
    expect(() =>
      grant.execute(
        { ...baseReq(), subject_token_type: 'urn:ietf:params:oauth:token-type:saml2' },
        'api-client',
        'x'
      )
    ).toThrow(OAuth2Error);
  });

  it('delegation records the actor', () => {
    const actorAt = tokens.mintAccessToken({
      clientId: 'api-client',
      subject: 'service-self',
      scope: ['read'],
      ttlSeconds: 60,
    });
    const out = grant.execute(
      { ...baseReq(), actor_token: actorAt.token, scope: 'read' },
      'api-client',
      'x'
    );
    expect(out.delegatedActor).toBe('api-client');
  });

  it('rejects actor tokens from a different client', () => {
    const other = tokens.mintAccessToken({
      clientId: 'other-client',
      scope: ['read'],
      ttlSeconds: 60,
    });
    expect(() =>
      grant.execute({ ...baseReq(), actor_token: other.token, scope: 'read' }, 'api-client', 'x')
    ).toThrow(OAuth2Error);
  });
});

describe('PushedAuthorization', () => {
  let clients: ClientRegistry;
  let par: PushedAuthorization;
  let clock: ManualOAuthClock2;

  beforeEach(() => {
    clock = new ManualOAuthClock2(0);
    clients = new ClientRegistry({ now: () => clock.now() });
    clients.registerConfidential('web', {
      redirectUris: ['https://app.example.com/cb'],
      allowedScopes: ['openid', 'profile'],
    });
    par = new PushedAuthorization(clients, { ttlSeconds: 60, clock });
  });

  const validReq = () => ({
    client_id: 'web',
    response_type: 'code' as const,
    redirect_uri: 'https://app.example.com/cb',
    scope: 'openid profile',
    state: 's123',
    code_challenge: 'challenge',
    code_challenge_method: 'S256' as const,
  });

  it('returns a request_uri and serves the request once', () => {
    const res = par.push(validReq());
    expect(res.request_uri.startsWith('urn:ietf:params:oauth:request_uri:')).toBe(true);
    expect(res.expires_in).toBe(60);
    const req = par.consume(res.request_uri, 'web');
    expect(req.state).toBe('s123');
    expect(req.code_challenge).toBe('challenge');
  });

  it('burns the request_uri on consume', () => {
    const res = par.push(validReq());
    par.consume(res.request_uri, 'web');
    expect(() => par.consume(res.request_uri, 'web')).toThrow(OAuth2Error);
  });

  it('expires request_uris', () => {
    const res = par.push(validReq());
    clock.advance(61_000);
    expect(() => par.consume(res.request_uri, 'web')).toThrow(/expired/);
  });

  it('rejects consume by a different client', () => {
    clients.registerPublic('other', { redirectUris: ['https://o/cb'] });
    const res = par.push(validReq());
    expect(() => par.consume(res.request_uri, 'other')).toThrow(OAuth2Error);
  });

  it('validates redirect_uri at push time', () => {
    expect(() =>
      par.push({ ...validReq(), redirect_uri: 'https://evil.example.com/cb' })
    ).toThrow(OAuth2Error);
  });

  it('rejects unsupported response types', () => {
    expect(() =>
      par.push({ ...validReq(), response_type: 'token' as never })
    ).toThrow(OAuth2Error);
  });

  it('sweep drops expired entries', () => {
    par.push(validReq());
    par.push(validReq());
    clock.advance(61_000);
    expect(par.sweep()).toBe(2);
    expect(par.pendingCount).toBe(0);
  });

  it('inspect peeks without consuming', () => {
    const res = par.push(validReq());
    expect(par.inspect(res.request_uri)?.state).toBe('s123');
    expect(par.consume(res.request_uri, 'web').state).toBe('s123'); // still there
  });
});
