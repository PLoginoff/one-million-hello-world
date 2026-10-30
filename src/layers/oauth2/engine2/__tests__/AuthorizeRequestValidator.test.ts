/**
 * Tests for AuthorizeRequestValidator (open-redirector + PKCE + state).
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ClientRegistry } from '../../core/ClientRegistry';
import { OAuth2Error } from '../../core/types';
import { AuthorizeRequestValidator } from '../AuthorizeRequestValidator';
import { ManualOAuthClock2 } from '../types';

const CH = 'a'.repeat(43); // valid-length challenge

describe('AuthorizeRequestValidator', () => {
  let clients: ClientRegistry;
  let validator: AuthorizeRequestValidator;
  let clock: ManualOAuthClock2;

  beforeEach(() => {
    clock = new ManualOAuthClock2(0);
    clients = new ClientRegistry({ now: () => clock.now() });
    clients.registerPublic('spa', {
      redirectUris: ['https://spa.example.com/cb'],
      allowedScopes: ['openid'],
      requirePkce: true,
    });
    clients.registerConfidential('web', {
      redirectUris: ['https://web.example.com/cb', 'https://web.example.com/cb2'],
      requirePkce: false,
      secret: 's',
    });
    validator = new AuthorizeRequestValidator(clients);
  });

  const base = () => ({
    client_id: 'spa',
    response_type: 'code',
    redirect_uri: 'https://spa.example.com/cb',
    scope: 'openid',
    state: 'csrf-token-42',
    code_challenge: CH,
    code_challenge_method: 'S256' as const,
  });

  it('normalizes a valid request', () => {
    const n = validator.validate(base());
    expect(n.redirect_uri).toBe('https://spa.example.com/cb');
    expect(n.scope).toEqual(['openid']);
    expect(n.warnings).toEqual([]);
  });

  it('rejects prefix-matched redirect_uri (open redirector)', () => {
    expect(() =>
      validator.validate({ ...base(), redirect_uri: 'https://spa.example.com/cb/extra' })
    ).toThrow(OAuth2Error);
    expect(() =>
      validator.validate({ ...base(), redirect_uri: 'https://spa.example.com.evil.com/' })
    ).toThrow(OAuth2Error);
  });

  it('defaults redirect_uri when client has exactly one registered', () => {
    const { redirect_uri: _r, ...noUri } = base();
    const n = validator.validate(noUri);
    expect(n.redirect_uri).toBe('https://spa.example.com/cb');
  });

  it('requires redirect_uri when client has several', () => {
    expect(() =>
      validator.validate({
        client_id: 'web',
        response_type: 'code',
        state: 's',
      })
    ).toThrow(/redirect_uri required/);
  });

  it('requires state by default', () => {
    const { state: _s, ...noState } = base();
    expect(() => validator.validate(noState)).toThrow(/state is required/);
    const lax = new AuthorizeRequestValidator(clients, { requireState: false });
    const n = lax.validate(noState);
    expect(n.warnings.some((w) => w.includes('CSRF'))).toBe(true);
  });

  it('enforces PKCE for public clients', () => {
    const { code_challenge: _c, ...noCh } = base();
    expect(() => validator.validate(noCh)).toThrow(/code_challenge required/);
  });

  it('enforces challenge length and charset', () => {
    expect(() => validator.validate({ ...base(), code_challenge: 'short' })).toThrow(
      /43-128/
    );
    expect(() =>
      validator.validate({ ...base(), code_challenge: '!!!' + 'a'.repeat(43) })
    ).toThrow(/disallowed characters/);
  });

  it('warns on plain PKCE method', () => {
    const n = validator.validate({ ...base(), code_challenge_method: 'plain' });
    expect(n.warnings.some((w) => w.includes('plain'))).toBe(true);
  });

  it('rejects non-code response types', () => {
    expect(() => validator.validate({ ...base(), response_type: 'token' })).toThrow(
      OAuth2Error
    );
  });
});
