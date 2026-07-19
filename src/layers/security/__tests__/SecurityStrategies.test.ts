/**
 * Security Strategies Unit Tests
 */

import { CorsStrategy } from '../strategies/cors/CorsStrategy';
import { IpWhitelistStrategy } from '../strategies/ipfilter/IpWhitelistStrategy';
import { HelmetStrategy } from '../strategies/helmet/HelmetStrategy';
import { CorsConfig } from '../types/security-types';

describe('CorsStrategy', () => {
  let config: CorsConfig;
  let strategy: CorsStrategy;

  beforeEach(() => {
    config = {
      allowedOrigins: ['https://example.com', 'https://app.example.com'],
      allowedMethods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      exposedHeaders: ['X-Request-Id'],
      credentials: true,
      maxAge: 3600,
    };
    strategy = new CorsStrategy(config);
  });

  it('should return name CORS', () => {
    expect(strategy.getName()).toBe('CORS');
  });

  it('should allow preflight from allowed origin', () => {
    const result = strategy.handlePreflight('https://example.com', 'GET');
    expect(result.allowed).toBe(true);
    expect(result.headers['Access-Control-Allow-Origin']).toBe('https://example.com');
  });

  it('should reject preflight from disallowed origin', () => {
    const result = strategy.handlePreflight('https://evil.com', 'GET');
    expect(result.allowed).toBe(false);
  });

  it('should reject preflight with disallowed method', () => {
    const result = strategy.handlePreflight('https://example.com', 'PATCH');
    expect(result.allowed).toBe(false);
  });

  it('should set credentials header when enabled', () => {
    const result = strategy.handlePreflight('https://example.com', 'GET');
    expect(result.headers['Access-Control-Allow-Credentials']).toBe('true');
  });

  it('should set exposed headers', () => {
    const result = strategy.handleRequest('https://example.com');
    expect(result.headers['Access-Control-Expose-Headers']).toBe('X-Request-Id');
  });

  it('should set max age', () => {
    const result = strategy.handlePreflight('https://example.com', 'GET');
    expect(result.headers['Access-Control-Max-Age']).toBe('3600');
  });

  it('should allow wildcard origin', () => {
    const wildcardStrategy = new CorsStrategy({ ...config, allowedOrigins: ['*'] });
    const result = wildcardStrategy.handlePreflight('https://anything.com', 'GET');
    expect(result.allowed).toBe(true);
    expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
  });
});

describe('IpWhitelistStrategy', () => {
  it('should return name IP_WHITELIST', () => {
    const strategy = new IpWhitelistStrategy([]);
    expect(strategy.getName()).toBe('IP_WHITELIST');
  });

  it('should allow whitelisted IP', () => {
    const strategy = new IpWhitelistStrategy(['192.168.1.1']);
    expect(strategy.isAllowed('192.168.1.1')).toBe(true);
  });

  it('should block non-whitelisted IP', () => {
    const strategy = new IpWhitelistStrategy(['192.168.1.1']);
    expect(strategy.isAllowed('10.0.0.1')).toBe(false);
    expect(strategy.isBlocked('10.0.0.1')).toBe(true);
  });

  it('should allow IP within CIDR range', () => {
    const strategy = new IpWhitelistStrategy(['192.168.1.0/24']);
    expect(strategy.isAllowed('192.168.1.50')).toBe(true);
    expect(strategy.isAllowed('192.168.1.255')).toBe(true);
  });

  it('should block IP outside CIDR range', () => {
    const strategy = new IpWhitelistStrategy(['192.168.1.0/24']);
    expect(strategy.isAllowed('192.168.2.1')).toBe(false);
  });

  it('should allow all IPs with 0.0.0.0/0', () => {
    const strategy = new IpWhitelistStrategy(['0.0.0.0/0']);
    expect(strategy.isAllowed('1.2.3.4')).toBe(true);
  });

  it('should allow empty whitelist blocks all', () => {
    const strategy = new IpWhitelistStrategy([]);
    expect(strategy.isAllowed('1.2.3.4')).toBe(false);
  });
});

describe('HelmetStrategy', () => {
  it('should return name HELMET', () => {
    const strategy = new HelmetStrategy();
    expect(strategy.getName()).toBe('HELMET');
  });

  it('should set default security headers', () => {
    const strategy = new HelmetStrategy();
    const headers = strategy.getHeaders();
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['Strict-Transport-Security']).toContain('max-age');
    expect(headers['X-XSS-Protection']).toBe('1; mode=block');
    expect(headers['Referrer-Policy']).toBe('no-referrer');
  });

  it('should set custom CSP', () => {
    const strategy = new HelmetStrategy({ contentSecurityPolicy: "default-src 'self'" });
    expect(strategy.getHeaders()['Content-Security-Policy']).toBe("default-src 'self'");
  });

  it('should allow disabling headers', () => {
    const strategy = new HelmetStrategy({
      xContentTypeOptions: false,
      xFrameOptions: undefined,
      xXssProtection: false,
    });
    const headers = strategy.getHeaders();
    expect(headers['X-Content-Type-Options']).toBeUndefined();
    expect(headers['X-Frame-Options']).toBeUndefined();
    expect(headers['X-XSS-Protection']).toBeUndefined();
  });
});
