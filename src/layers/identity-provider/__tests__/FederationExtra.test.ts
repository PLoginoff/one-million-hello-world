/**
 * Federation extra tests — ConsentStore and RelyingPartyRegistry.
 */

import { describe, it, expect } from 'bun:test';
import { ConsentStore } from '../federation/ConsentStore';
import { RelyingPartyRegistry } from '../federation/RelyingPartyRegistry';
import { FederationError, FederationErrorCode } from '../federation/types';

describe('ConsentStore', () => {
  it('filters released attributes through consent', () => {
    const store = new ConsentStore();
    store.grant('u1', 'sp1', ['email', 'name']);
    const r = store.filter('u1', 'sp1', { email: ['a@b.c'], name: ['A'], dept: ['IT'] });
    expect(r.allowed).toEqual({ email: ['a@b.c'], name: ['A'] });
    expect(r.needsConsent).toEqual(['dept']);
  });

  it('rememberAll admits future attributes', () => {
    const store = new ConsentStore();
    store.grant('u1', 'sp1', [], 0, undefined, true);
    const r = store.filter('u1', 'sp1', { anything: ['x'] });
    expect(r.allowed.anything).toEqual(['x']);
  });

  it('expired consent blocks release; sweep clears it', () => {
    const store = new ConsentStore();
    store.grant('u1', 'sp1', ['email'], 1_000, 5_000);
    expect(store.current('u1', 'sp1', 5_999)).toBeDefined();
    expect(store.current('u1', 'sp1', 6_001)).toBeUndefined();
    const r = store.filter('u1', 'sp1', { email: ['a@b.c'] }, 6_001);
    expect(r.needsConsent).toEqual(['email']);
    expect(store.sweep(6_001)).toBe(1);
  });

  it('revoke removes consent', () => {
    const store = new ConsentStore();
    store.grant('u1', 'sp1', ['email']);
    expect(store.revoke('u1', 'sp1')).toBe(true);
    expect(store.filter('u1', 'sp1', { email: ['a'] }).needsConsent).toEqual(['email']);
  });
});

describe('RelyingPartyRegistry', () => {
  it('registers clients and validates authorization requests', () => {
    const reg = new RelyingPartyRegistry();
    const { client } = reg.register({
      redirectUris: ['https://app/cb'],
      allowedScopes: ['openid', 'email'],
      requirePkce: true,
    });
    const ok = reg.validateAuthorizationRequest({
      responseType: 'code', clientId: client.clientId, redirectUri: 'https://app/cb',
      scope: ['openid'], codeChallenge: 'cc', codeChallengeMethod: 'S256',
    });
    expect(ok.clientId).toBe(client.clientId);
  });

  it('rejects unregistered redirect_uri (exact match only)', () => {
    const reg = new RelyingPartyRegistry();
    const { client } = reg.register({ redirectUris: ['https://app/cb'], allowedScopes: ['openid'] });
    expect(() => reg.validateAuthorizationRequest({
      responseType: 'code', clientId: client.clientId, redirectUri: 'https://app/cb/../evil',
      scope: ['openid'],
    })).toThrowError(expect.objectContaining({ code: FederationErrorCode.STATE_MISMATCH }));
    expect(() => reg.validateAuthorizationRequest({
      responseType: 'code', clientId: client.clientId, redirectUri: 'https://app/cb/',
      scope: ['openid'],
    })).toThrow(FederationError); // trailing slash != registered
  });

  it('enforces scope subset and PKCE requirement', () => {
    const reg = new RelyingPartyRegistry();
    const { client } = reg.register({
      redirectUris: ['https://app/cb'], allowedScopes: ['openid'], requirePkce: true,
    });
    expect(() => reg.validateAuthorizationRequest({
      responseType: 'code', clientId: client.clientId, redirectUri: 'https://app/cb',
      scope: ['openid', 'admin'],
    })).toThrow(FederationError);
    expect(() => reg.validateAuthorizationRequest({
      responseType: 'code', clientId: client.clientId, redirectUri: 'https://app/cb',
      scope: ['openid'], // missing PKCE
    })).toThrowError(expect.objectContaining({ code: FederationErrorCode.BAD_REQUEST }));
  });

  it('client secrets verify via hash; disabled clients rejected', () => {
    const reg = new RelyingPartyRegistry();
    const { client, secret } = reg.register({
      redirectUris: ['https://app/cb'], allowedScopes: ['openid'], withSecret: true,
    });
    expect(reg.verifySecret(client.clientId, secret!)).toBe(true);
    expect(reg.verifySecret(client.clientId, 'wrong')).toBe(false);
    reg.setActive(client.clientId, false);
    expect(() => reg.validateAuthorizationRequest({
      responseType: 'code', clientId: client.clientId, redirectUri: 'https://app/cb', scope: ['openid'],
    })).toThrow(FederationError);
  });
});
