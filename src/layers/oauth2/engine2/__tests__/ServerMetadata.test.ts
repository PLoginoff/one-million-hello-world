/**
 * Tests for ServerMetadata (RFC 8414 + RFC 8707 resource indicators).
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ServerMetadata } from '../ServerMetadata';
import { GRANT_TOKEN_EXCHANGE } from '../types';
import { OAuth2Error } from '../../core/types';

describe('ServerMetadata', () => {
  let md: ServerMetadata;

  beforeEach(() => {
    md = new ServerMetadata({
      issuer: 'https://auth.example.com/',
      grants: ['authorization_code', 'refresh_token', 'client_credentials'],
      scopes: ['openid', 'profile'],
      endpoints: { token_endpoint: '/oauth/token' },
    });
  });

  it('publishes a conformant metadata document', () => {
    const doc = md.metadataDocument();
    expect(doc.issuer).toBe('https://auth.example.com'); // trailing slash stripped
    expect(doc.token_endpoint).toBe('https://auth.example.com/oauth/token');
    expect(doc.authorization_endpoint).toBe('https://auth.example.com/authorize');
    expect(doc.grant_types_supported).toContain(GRANT_TOKEN_EXCHANGE);
    expect(doc.grant_types_supported).toContain('authorization_code');
    expect(doc.code_challenge_methods_supported).toEqual(['S256', 'plain']);
    expect(doc.pushed_authorization_request_endpoint_supported).toBe(true);
  });

  it('accepts registered resource indicators', () => {
    md.registerResource('https://api.example.com/');
    md.registerResource('urn:example:service');
    expect(md.resolveResource('https://api.example.com/')).toEqual(['https://api.example.com/']);
    expect(md.resolveResource(['https://api.example.com/', 'urn:example:service']).length).toBe(2);
  });

  it('rejects relative or fragment-bearing resource URIs', () => {
    expect(() => md.resolveResource('not-a-uri')).toThrow(OAuth2Error);
    expect(() => md.resolveResource('https://x/#frag')).toThrow(OAuth2Error);
  });

  it('rejects unregistered resources when a registry exists', () => {
    md.registerResource('https://api.example.com/');
    expect(() => md.resolveResource('https://other.example.com/')).toThrow(OAuth2Error);
  });

  it('any absolute URI passes when no registry configured', () => {
    expect(md.resolveResource('https://anything.example.com/')).toEqual([
      'https://anything.example.com/',
    ]);
  });

  it('empty/undefined params resolve to empty list', () => {
    expect(md.resolveResource(undefined)).toEqual([]);
    expect(md.resolveResource([])).toEqual([]);
    expect(md.resolveResource('')).toEqual([]);
  });

  it('registerResource validates absolute URIs too', () => {
    expect(() => md.registerResource('relative')).toThrow(OAuth2Error);
    md.registerResource('https://a.example.com');
    expect(md.unregisterResource('https://a.example.com')).toBe(true);
    expect(md.unregisterResource('https://a.example.com')).toBe(false);
  });
});
