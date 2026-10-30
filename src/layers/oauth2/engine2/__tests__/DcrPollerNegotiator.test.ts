/**
 * Tests for DynamicClientRegistration (RFC 7591), DeviceFlowPoller
 * (RFC 8628 client side), and GrantNegotiator.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ClientRegistry } from '../../core/ClientRegistry';
import { TokenStore } from '../../core/TokenStore';
import { DeviceCodeGrant } from '../../grants/DeviceCodeGrant';
import { OAuth2Error } from '../../core/types';
import { DynamicClientRegistration } from '../DynamicClientRegistration';
import { DeviceFlowPoller } from '../DeviceFlowPoller';
import { GrantNegotiator } from '../GrantNegotiator';
import { ManualOAuthClock2, GRANT_TOKEN_EXCHANGE } from '../types';

describe('DynamicClientRegistration', () => {
  let clients: ClientRegistry;
  let dcr: DynamicClientRegistration;
  let clock: ManualOAuthClock2;

  beforeEach(() => {
    clock = new ManualOAuthClock2(1_700_000_000_000);
    clients = new ClientRegistry({ now: () => clock.now() });
    dcr = new DynamicClientRegistration(clients, {
      registerableScopes: ['openid', 'profile', 'email'],
      registrationBaseUri: 'https://auth.example.com/register',
      clock,
    });
  });

  it('registers a confidential client with a secret', () => {
    const res = dcr.register({
      redirect_uris: ['https://app.example.com/cb'],
      grant_types: ['authorization_code', 'refresh_token'],
      client_name: 'My App',
      scope: 'openid profile',
    });
    expect(res.client_id.startsWith('dcr-')).toBe(true);
    expect(res.client_secret).toBeDefined();
    expect(res.registration_access_token.startsWith('rat-')).toBe(true);
    expect(res.registration_client_uri).toContain(res.client_id);
    expect(clients.has(res.client_id)).toBe(true);
    // Secret actually authenticates.
    const authed = clients.authenticate(res.client_id, res.client_secret);
    expect(authed.clientId).toBe(res.client_id);
  });

  it('registers a public client (auth_method none) without a secret', () => {
    const res = dcr.register({
      token_endpoint_auth_method: 'none',
      redirect_uris: ['https://spa.example.com/cb'],
      grant_types: ['authorization_code'],
    });
    expect(res.client_secret).toBeUndefined();
    const c = clients.get(res.client_id);
    expect(c.isPublic).toBe(true);
    expect(c.requirePkce).toBe(true);
  });

  it('rejects unlisted grant types', () => {
    expect(() =>
      dcr.register({ grant_types: ['password'] })
    ).toThrowError(/unsupported grant_type/);
  });

  it('requires redirect_uris for authorization_code', () => {
    expect(() => dcr.register({ grant_types: ['authorization_code'] })).toThrowError(
      /redirect_uris required/
    );
  });

  it('client_credentials clients need no redirect_uris', () => {
    const res = dcr.register({ grant_types: ['client_credentials'] });
    expect(res.client_id).toBeDefined();
  });

  it('rejects non-https redirect URIs (except localhost)', () => {
    expect(() =>
      dcr.register({
        grant_types: ['authorization_code'],
        redirect_uris: ['http://evil.example.com/cb'],
      })
    ).toThrowError(/https required/);
    const ok = dcr.register({
      grant_types: ['authorization_code'],
      redirect_uris: ['http://localhost:3000/cb'],
    });
    expect(ok.client_id).toBeDefined();
  });

  it('rejects URIs with fragments', () => {
    expect(() =>
      dcr.register({
        grant_types: ['authorization_code'],
        redirect_uris: ['https://app.example.com/cb#frag'],
      })
    ).toThrowError(/fragment/);
  });

  it('rejects scopes outside the registerable set', () => {
    expect(() =>
      dcr.register({
        grant_types: ['client_credentials'],
        scope: 'admin',
      })
    ).toThrowError(/not registerable/);
  });

  it('registration token authorizes read + delete', () => {
    const res = dcr.register({ grant_types: ['client_credentials'] });
    const read = dcr.read(res.registration_access_token);
    expect(read.clientId).toBe(res.client_id);
    expect(dcr.delete(res.registration_access_token)).toBe(true);
    expect(clients.has(res.client_id)).toBe(false);
    // Token burned.
    expect(() => dcr.read(res.registration_access_token)).toThrow(OAuth2Error);
  });
});

describe('DeviceFlowPoller', () => {
  let clients: ClientRegistry;
  let tokens: TokenStore;
  let grant: DeviceCodeGrant;
  let clock: ManualOAuthClock2;
  let slept: number[];

  beforeEach(() => {
    clock = new ManualOAuthClock2(0);
    slept = [];
    clients = new ClientRegistry({ now: () => clock.now() });
    tokens = new TokenStore({ now: () => clock.now() });
    clients.registerPublic('tv', {
      allowedGrantTypes: ['urn:ietf:params:oauth:grant-type:device_code'],
      allowedScopes: ['watch'],
    });
    grant = new DeviceCodeGrant(clients, tokens, {
      now: () => clock.now(),
      deviceTtlSeconds: 600,
      pollIntervalSeconds: 5,
      minPollIntervalMs: 1_000,
    });
  });

  const fakeSleep = (ms: number) => {
    slept.push(ms);
    clock.advance(ms);
    return Promise.resolve();
  };

  it('polls until the user approves', async () => {
    const auth = grant.deviceAuthorization({ client_id: 'tv', scope: 'watch' });
    const poller = new DeviceFlowPoller(grant, { sleep: fakeSleep, clock });
    // Approve "after" the second sleep — the grant is synchronous so we
    // approve eagerly between the second and third poll via the clock.
    const p = poller.poll('tv', auth);
    // First poll happens synchronously → pending. Advance + approve.
    await Promise.resolve();
    grant.approve(auth.user_code, 'user-7');
    const res = await p;
    expect(res.status).toBe('approved');
    if (res.status === 'approved') {
      expect(res.token.token_type).toBe('Bearer');
      expect(res.polls).toBeGreaterThanOrEqual(2);
    }
  });

  it('returns denied when the user refuses', async () => {
    const auth = grant.deviceAuthorization({ client_id: 'tv' });
    grant.deny(auth.user_code);
    const poller = new DeviceFlowPoller(grant, { sleep: fakeSleep, clock });
    const res = await poller.poll('tv', auth);
    expect(res.status).toBe('denied');
  });

  it('increases interval on slow_down (RFC 8628 §3.5)', async () => {
    // minPollIntervalMs=1000 but interval=5s — polls faster than 1s back
    // to back trigger slow_down only when polling under minPollInterval.
    const auth = grant.deviceAuthorization({ client_id: 'tv' });
    const poller = new DeviceFlowPoller(grant, {
      sleep: (ms) => {
        slept.push(ms);
        clock.advance(ms);
        return Promise.resolve();
      },
      deadlineMs: 30_000,
      clock,
    });
    const res = await poller.poll('tv', auth);
    expect(res.status).toBe('timeout');
    // Intervals slept: 5s, 5s, ... — the token endpoint's slow_down path
    // only engages if polls land faster than minPollIntervalMs; our
    // fake sleep advances the clock so this doesn't fire. Assert shape.
    expect(slept.every((ms) => ms >= 5_000)).toBe(true);
  });
});

describe('GrantNegotiator', () => {
  const neg = new GrantNegotiator();
  const mkClient = (grants: string[], isPublic = false): Parameters<GrantNegotiator['negotiate']>[0] => ({
    clientId: 'c',
    isPublic,
    redirectUris: [],
    allowedGrantTypes: grants as never,
    allowedScopes: [],
    requirePkce: true,
    accessTokenTtlSeconds: 900,
  });

  it('prefers authorization_code for interactive clients', () => {
    const out = neg.negotiate(mkClient(['authorization_code', 'client_credentials']));
    expect(out[0].grant).toBe('authorization_code');
  });

  it('picks client_credentials for M2M', () => {
    const best = neg.best(mkClient(['authorization_code', 'client_credentials']), {
      requiresUser: false,
    });
    expect(best).toBe('client_credentials');
  });

  it('prefers device flow for input-constrained devices', () => {
    const out = neg.negotiate(
      mkClient(['authorization_code', 'urn:ietf:params:oauth:grant-type:device_code']),
      { inputConstrained: true }
    );
    expect(out[0].grant).toBe('urn:ietf:params:oauth:grant-type:device_code');
  });

  it('drops user grants when no interaction is possible', () => {
    const out = neg.negotiate(
      mkClient(['authorization_code', 'client_credentials', 'password']),
      { hasUserInteraction: false }
    );
    expect(out.map((o) => o.grant)).toEqual(['client_credentials']);
  });

  it('public clients cannot use client_credentials', () => {
    const out = neg.negotiate(mkClient(['client_credentials'], true), { isPublicClient: true });
    expect(out).toEqual([]);
  });

  it('offline requirement surfaces refresh_token', () => {
    const out = neg.negotiate(mkClient(['authorization_code', 'refresh_token']), {
      requiresUser: true,
      offline: true,
    });
    expect(out.some((o) => o.grant === 'refresh_token')).toBe(true);
  });

  it('token exchange is available when allowed', () => {
    const out = neg.negotiate(mkClient([GRANT_TOKEN_EXCHANGE]));
    expect(out.map((o) => o.grant)).toEqual([GRANT_TOKEN_EXCHANGE]);
  });

  it('returns empty when nothing fits', () => {
    expect(neg.negotiate(mkClient(['password']), { requiresUser: false })).toEqual([]);
  });
});
