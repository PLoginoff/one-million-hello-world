/**
 * OAuth2 real implementation tests — all four grant types, PKCE,
 * introspection, revocation, scope validation, error codes.
 */

import { describe, expect, it } from 'bun:test';
import { OAuth2AuthorizationServer } from '../OAuth2AuthorizationServer';
import { Pkce } from '../core/Pkce';
import { OAuth2Error, parseScope, scopeSubset } from '../core/types';

const NOW = 1_700_000_000_000;

function newServer(): OAuth2AuthorizationServer {
  return new OAuth2AuthorizationServer({ now: () => NOW, issuer: 'https://auth.test' });
}

describe('Pkce', () => {
  it('generates verifier and derives S256 challenge', () => {
    const v = Pkce.generateVerifier();
    expect(v.length).toBeGreaterThanOrEqual(43);
    const c = Pkce.challenge(v, 'S256');
    expect(c).not.toBe(v);
    expect(Pkce.verify(v, c, 'S256')).toBe(true);
    expect(Pkce.verify('wrong-verifier-wrong-verifier-wrong-verifier-xx', c, 'S256')).toBe(false);
  });

  it('plain method echoes verifier', () => {
    const v = Pkce.generateVerifier();
    expect(Pkce.challenge(v, 'plain')).toBe(v);
    expect(Pkce.verify(v, v, 'plain')).toBe(true);
  });

  it('rejects invalid verifiers', () => {
    expect(Pkce.isValidVerifier('short')).toBe(false);
    expect(Pkce.isValidVerifier('a'.repeat(50))).toBe(true);
    expect(Pkce.isValidVerifier('a'.repeat(129))).toBe(false);
  });
});

describe('ClientRegistry', () => {
  it('registers confidential + public clients', () => {
    const srv = newServer();
    const { secret } = srv.clients.registerConfidential('svc-a', {
      allowedScopes: ['read', 'write'],
    });
    expect(srv.clients.has('svc-a')).toBe(true);
    srv.clients.registerPublic('spa-app', { redirectUris: ['https://app/cb'] });
    expect(srv.clients.size).toBe(2);
    expect(() => srv.clients.authenticate('svc-a')).toThrow(OAuth2Error);
    expect(() => srv.clients.authenticate('svc-a', 'bad')).toThrow(OAuth2Error);
    expect(srv.clients.authenticate('svc-a', secret).clientId).toBe('svc-a');
  });

  it('rejects unregistered redirect_uri (open-redirect guard)', () => {
    const srv = newServer();
    srv.clients.registerPublic('spa', { redirectUris: ['https://ok/cb'] });
    expect(() => srv.clients.validateRedirectUri('spa', 'https://evil/cb')).toThrow(OAuth2Error);
    expect(() => srv.clients.validateRedirectUri('spa', 'https://ok/cb')).not.toThrow();
  });
});

describe('Authorization Code flow', () => {
  function setupClient(srv: OAuth2AuthorizationServer) {
    return srv.clients.registerPublic('web-app', {
      redirectUris: ['https://app/callback'],
      allowedScopes: ['openid', 'profile', 'email'],
      allowedGrantTypes: ['authorization_code', 'refresh_token'],
      refreshTokenTtlSeconds: 3600,
      requirePkce: true,
    });
  }

  it('completes a full authorization_code flow with PKCE S256', () => {
    const srv = newServer();
    setupClient(srv);
    const verifier = Pkce.generateVerifier();
    const challenge = Pkce.challenge(verifier, 'S256');

    const auth = srv.authCode.authorize({
      response_type: 'code',
      client_id: 'web-app',
      redirect_uri: 'https://app/callback',
      scope: 'openid profile',
      state: 'csrf-123',
      subject: 'user-1',
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    expect(auth.redirectUri).toContain('https://app/callback?code=');
    expect(auth.state).toBe('csrf-123');

    const tokens = srv.authCode.exchange({
      grant_type: 'authorization_code',
      code: auth.code,
      redirect_uri: 'https://app/callback',
      client_id: 'web-app',
      code_verifier: verifier,
    });
    expect(tokens.access_token).toMatch(/^at-/);
    expect(tokens.refresh_token).toMatch(/^rt-/);
    expect(tokens.token_type).toBe('Bearer');
    expect(tokens.scope).toBe('openid profile');
  });

  it('rejects PKCE verifier mismatch', () => {
    const srv = newServer();
    setupClient(srv);
    const auth = srv.authCode.authorize({
      response_type: 'code',
      client_id: 'web-app',
      redirect_uri: 'https://app/callback',
      subject: 'u',
      code_challenge: Pkce.challenge(Pkce.generateVerifier(), 'S256'),
      code_challenge_method: 'S256',
    });
    expect(() =>
      srv.authCode.exchange({
        grant_type: 'authorization_code',
        code: auth.code,
        redirect_uri: 'https://app/callback',
        client_id: 'web-app',
        code_verifier: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      })
    ).toThrow(OAuth2Error);
  });

  it('rejects code replay and revokes derived tokens', () => {
    const srv = newServer();
    setupClient(srv);
    const verifier = Pkce.generateVerifier();
    const auth = srv.authCode.authorize({
      response_type: 'code',
      client_id: 'web-app',
      redirect_uri: 'https://app/callback',
      subject: 'u',
      code_challenge: Pkce.challenge(verifier, 'S256'),
      code_challenge_method: 'S256',
    });
    const t1 = srv.authCode.exchange({
      grant_type: 'authorization_code',
      code: auth.code,
      redirect_uri: 'https://app/callback',
      client_id: 'web-app',
      code_verifier: verifier,
    });
    // Replay same code → invalid_grant + derived tokens revoked
    expect(() =>
      srv.authCode.exchange({
        grant_type: 'authorization_code',
        code: auth.code,
        redirect_uri: 'https://app/callback',
        client_id: 'web-app',
        code_verifier: verifier,
      })
    ).toThrow(OAuth2Error);
    expect(srv.introspect({ token: t1.access_token }).active).toBe(false);
  });

  it('requires PKCE when client demands it', () => {
    const srv = newServer();
    setupClient(srv);
    expect(() =>
      srv.authCode.authorize({
        response_type: 'code',
        client_id: 'web-app',
        redirect_uri: 'https://app/callback',
        subject: 'u',
      })
    ).toThrow(OAuth2Error);
  });

  it('rejects redirect_uri mismatch at token endpoint', () => {
    const srv = newServer();
    setupClient(srv);
    const verifier = Pkce.generateVerifier();
    const auth = srv.authCode.authorize({
      response_type: 'code',
      client_id: 'web-app',
      redirect_uri: 'https://app/callback',
      subject: 'u',
      code_challenge: Pkce.challenge(verifier, 'S256'),
      code_challenge_method: 'S256',
    });
    expect(() =>
      srv.authCode.exchange({
        grant_type: 'authorization_code',
        code: auth.code,
        redirect_uri: 'https://different/callback',
        client_id: 'web-app',
        code_verifier: verifier,
      })
    ).toThrow(OAuth2Error);
  });

  it('rejects scope escalation', () => {
    const srv = newServer();
    setupClient(srv);
    expect(() =>
      srv.authCode.authorize({
        response_type: 'code',
        client_id: 'web-app',
        redirect_uri: 'https://app/callback',
        scope: 'admin',
        subject: 'u',
        code_challenge: Pkce.challenge(Pkce.generateVerifier(), 'S256'),
        code_challenge_method: 'S256',
      })
    ).toThrow(OAuth2Error);
  });
});

describe('Client Credentials flow', () => {
  it('issues tokens for confidential clients only', () => {
    const srv = newServer();
    const { secret } = srv.clients.registerConfidential('backend', {
      allowedScopes: ['api:read'],
      allowedGrantTypes: ['client_credentials'],
    });
    const t = srv.clientCreds.execute({
      grant_type: 'client_credentials',
      client_id: 'backend',
      client_secret: secret,
      scope: 'api:read',
    });
    expect(t.token_type).toBe('Bearer');
    expect(t.refresh_token).toBeUndefined();
  });

  it('rejects public clients', () => {
    const srv = newServer();
    srv.clients.registerPublic('pub', {
      allowedGrantTypes: ['client_credentials'],
      allowedScopes: ['x'],
    });
    expect(() =>
      srv.clientCreds.execute({
        grant_type: 'client_credentials',
        client_id: 'pub',
        client_secret: 'x',
      })
    ).toThrow(OAuth2Error);
  });
});

describe('Refresh Token flow', () => {
  it('rotates refresh tokens and narrows scope', () => {
    const srv = newServer();
    srv.clients.registerPublic('app', {
      redirectUris: ['https://a/cb'],
      allowedScopes: ['openid', 'profile', 'email'],
      allowedGrantTypes: ['authorization_code', 'refresh_token'],
      refreshTokenTtlSeconds: 3600,
      requirePkce: false,
    });
    const auth = srv.authCode.authorize({
      response_type: 'code',
      client_id: 'app',
      redirect_uri: 'https://a/cb',
      scope: 'openid profile email',
      subject: 'user-9',
    });
    const t1 = srv.authCode.exchange({
      grant_type: 'authorization_code',
      code: auth.code,
      redirect_uri: 'https://a/cb',
      client_id: 'app',
    });
    expect(t1.refresh_token).toBeDefined();

    const t2 = srv.refreshToken.execute({
      grant_type: 'refresh_token',
      refresh_token: t1.refresh_token!,
      client_id: 'app',
      scope: 'openid profile', // narrow
    });
    expect(t2.access_token).not.toBe(t1.access_token);
    expect(t2.refresh_token).not.toBe(t1.refresh_token);
    expect(t2.scope).toBe('openid profile');
  });

  it('detects refresh-token reuse and revokes family', () => {
    const srv = newServer();
    srv.clients.registerPublic('app', {
      redirectUris: ['https://a/cb'],
      allowedGrantTypes: ['authorization_code', 'refresh_token'],
      refreshTokenTtlSeconds: 3600,
      requirePkce: false,
    });
    const auth = srv.authCode.authorize({
      response_type: 'code',
      client_id: 'app',
      redirect_uri: 'https://a/cb',
      subject: 'u',
    });
    const t1 = srv.authCode.exchange({
      grant_type: 'authorization_code',
      code: auth.code,
      redirect_uri: 'https://a/cb',
      client_id: 'app',
    });
    const t2 = srv.refreshToken.execute({
      grant_type: 'refresh_token',
      refresh_token: t1.refresh_token!,
      client_id: 'app',
    });
    expect(() =>
      srv.refreshToken.execute({
        grant_type: 'refresh_token',
        refresh_token: t1.refresh_token!,
        client_id: 'app',
      })
    ).toThrow(OAuth2Error);
    // Family revoked — even the NEW refresh token now fails
    expect(() =>
      srv.refreshToken.execute({
        grant_type: 'refresh_token',
        refresh_token: t2.refresh_token!,
        client_id: 'app',
      })
    ).toThrow(OAuth2Error);
  });

  it('rejects scope widening on refresh', () => {
    const srv = newServer();
    srv.clients.registerPublic('app', {
      redirectUris: ['https://a/cb'],
      allowedGrantTypes: ['authorization_code', 'refresh_token'],
      allowedScopes: ['openid'],
      refreshTokenTtlSeconds: 3600,
      requirePkce: false,
    });
    const auth = srv.authCode.authorize({
      response_type: 'code',
      client_id: 'app',
      redirect_uri: 'https://a/cb',
      scope: 'openid',
      subject: 'u',
    });
    const t1 = srv.authCode.exchange({
      grant_type: 'authorization_code',
      code: auth.code,
      redirect_uri: 'https://a/cb',
      client_id: 'app',
    });
    expect(() =>
      srv.refreshToken.execute({
        grant_type: 'refresh_token',
        refresh_token: t1.refresh_token!,
        client_id: 'app',
        scope: 'openid admin',
      })
    ).toThrow(OAuth2Error);
  });
});

describe('Device Code flow', () => {
  it('polls authorization_pending until user approves', () => {
    let nowMs = NOW;
    const srv = new OAuth2AuthorizationServer({ now: () => nowMs, issuer: 'https://auth.test' });
    srv.clients.registerPublic('tv-app', {
      allowedGrantTypes: ['urn:ietf:params:oauth:grant-type:device_code', 'refresh_token'],
      allowedScopes: ['video:watch'],
      refreshTokenTtlSeconds: 3600,
    });
    const da = srv.deviceCode.deviceAuthorization({
      client_id: 'tv-app',
      scope: 'video:watch',
    });
    expect(da.user_code).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ23456789]{4}-[BCDFGHJKLMNPQRSTVWXZ23456789]{4}$/);
    expect(da.verification_uri).toBeDefined();

    // First poll → authorization_pending
    try {
      srv.deviceCode.token({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: da.device_code,
        client_id: 'tv-app',
      });
      expect.unreachable('should have thrown authorization_pending');
    } catch (err) {
      expect((err as OAuth2Error).code).toBe('authorization_pending');
    }

    // User approves
    expect(srv.deviceCode.approve(da.user_code, 'user-tv')).toBe(true);

    // Next poll succeeds (advance past poll interval)
    nowMs += 2000;
    const t = srv.deviceCode.token({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: da.device_code,
      client_id: 'tv-app',
    });
    expect(t.access_token).toMatch(/^at-/);
  });

  it('returns access_denied after user denial', () => {
    const srv = newServer();
    srv.clients.registerPublic('tv', {
      allowedGrantTypes: ['urn:ietf:params:oauth:grant-type:device_code'],
    });
    const da = srv.deviceCode.deviceAuthorization({ client_id: 'tv' });
    srv.deviceCode.deny(da.user_code);
    try {
      // no advance needed — denial is not rate-limited
      srv.deviceCode.token({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: da.device_code,
        client_id: 'tv',
      });
      expect.unreachable();
    } catch (err) {
      expect((err as OAuth2Error).code).toBe('access_denied');
    }
  });
});

describe('Introspection & revocation', () => {
  it('introspects active and revoked tokens', () => {
    const srv = newServer();
    const { secret } = srv.clients.registerConfidential('api', {
      allowedGrantTypes: ['client_credentials'],
      allowedScopes: ['read'],
    });
    const t = srv.clientCreds.execute({
      grant_type: 'client_credentials',
      client_id: 'api',
      client_secret: secret,
      scope: 'read',
    });
    const i = srv.introspect({ token: t.access_token });
    expect(i.active).toBe(true);
    expect(i.client_id).toBe('api');
    expect(i.scope).toBe('read');

    srv.revoke(t.access_token);
    expect(srv.introspect({ token: t.access_token }).active).toBe(false);
  });

  it('returns inactive for unknown tokens', () => {
    const srv = newServer();
    expect(srv.introspect({ token: 'at-nothing' }).active).toBe(false);
  });
});

describe('scope helpers', () => {
  it('parseScope splits on whitespace', () => {
    expect(parseScope('a b  c')).toEqual(['a', 'b', 'c']);
    expect(parseScope('')).toEqual([]);
    expect(parseScope(undefined)).toEqual([]);
  });
  it('scopeSubset works', () => {
    expect(scopeSubset(['a', 'b'], ['a', 'b', 'c'])).toBe(true);
    expect(scopeSubset(['a', 'd'], ['a', 'b'])).toBe(false);
  });
});
