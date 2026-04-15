/**
 * Rate Limiter Unit Tests
 * 
 * Tests for RateLimiter implementation.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { RateLimiter } from '../implementations/RateLimiter';
import { HttpRequest } from '../../http-parser/types/http-parser-types';
import { HttpMethod, HttpVersion } from '../../http-parser/types/http-parser-types';
import { SecurityContext } from '../../security/types/security-types';
import { RateLimitStrategy, RateLimitIdentifierType } from '../types/rate-limiting-types';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter();
  });

  describe('getRateLimitConfig', () => {
    it('should return default configuration', () => {
      const config = limiter.getRateLimitConfig();

      expect(config).toBeDefined();
      expect(config.requestsPerWindow).toBe(100);
      expect(config.windowSizeMs).toBe(60000);
      expect(config.burstSize).toBe(10);
      expect(config.strategy).toBe(RateLimitStrategy.TOKEN_BUCKET);
    });
  });

  describe('setRateLimitConfig', () => {
    it('should update rate limit configuration', () => {
      const newConfig = {
        requestsPerWindow: 200,
        windowSizeMs: 120000,
        burstSize: 20,
        strategy: RateLimitStrategy.SLIDING_WINDOW,
      };

      limiter.setRateLimitConfig(newConfig);
      const config = limiter.getRateLimitConfig();

      expect(config.requestsPerWindow).toBe(200);
      expect(config.windowSizeMs).toBe(120000);
      expect(config.burstSize).toBe(20);
      expect(config.strategy).toBe(RateLimitStrategy.SLIDING_WINDOW);
    });
  });

  describe('getStats', () => {
    it('should return initial statistics', () => {
      const stats = limiter.getStats();

      expect(stats).toBeDefined();
      expect(stats.totalRequests).toBe(0);
      expect(stats.allowedRequests).toBe(0);
      expect(stats.deniedRequests).toBe(0);
      expect(stats.currentBuckets).toBe(0);
    });
  });

  describe('resetStats', () => {
    it('should reset statistics to initial values', () => {
      limiter.resetStats();
      const stats = limiter.getStats();

      expect(stats.totalRequests).toBe(0);
      expect(stats.allowedRequests).toBe(0);
      expect(stats.deniedRequests).toBe(0);
    });
  });

  describe('checkRateLimit', () => {
    it('should allow requests within limit', () => {
      const request = createMockRequest();
      const result = limiter.checkRateLimit(request);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThan(0);
    });

    it('should update statistics on allowed request', () => {
      const request = createMockRequest();
      limiter.checkRateLimit(request);
      const stats = limiter.getStats();

      expect(stats.totalRequests).toBe(1);
      expect(stats.allowedRequests).toBe(1);
      expect(stats.deniedRequests).toBe(0);
    });

    it('should deny requests when bucket is empty', () => {
      const request = createMockRequest();
      limiter.setRateLimitConfig({
        requestsPerWindow: 1,
        windowSizeMs: 60000,
        burstSize: 1,
        strategy: RateLimitStrategy.TOKEN_BUCKET,
      });

      limiter.checkRateLimit(request);
      const result = limiter.checkRateLimit(request);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeDefined();
    });

    it('should update statistics on denied request', () => {
      const request = createMockRequest();
      limiter.setRateLimitConfig({
        requestsPerWindow: 1,
        windowSizeMs: 60000,
        burstSize: 1,
        strategy: RateLimitStrategy.TOKEN_BUCKET,
      });

      limiter.checkRateLimit(request);
      limiter.checkRateLimit(request);
      const stats = limiter.getStats();

      expect(stats.totalRequests).toBe(2);
      expect(stats.allowedRequests).toBe(1);
      expect(stats.deniedRequests).toBe(1);
    });

    it('should use custom identifier when provided', () => {
      const request = createMockRequest();
      const customIdentifier = {
        type: RateLimitIdentifierType.CUSTOM,
        value: 'custom-id',
      };

      const result = limiter.checkRateLimit(request, undefined, customIdentifier);

      expect(result.allowed).toBe(true);
    });

    it('should use user ID from security context', () => {
      const request = createMockRequest();
      const context: SecurityContext = {
        isAuthenticated: true,
        userId: 'user-123',
        roles: ['user'],
        permissions: ['read'],
        ipAddress: '127.0.0.1',
        userAgent: 'test',
      };

      const result = limiter.checkRateLimit(request, context);

      expect(result.allowed).toBe(true);
    });
  });

  describe('extractIdentifier', () => {
    it('should extract user ID from authenticated context', () => {
      const request = createMockRequest();
      const context: SecurityContext = {
        isAuthenticated: true,
        userId: 'user-123',
        roles: ['user'],
        permissions: ['read'],
        ipAddress: '127.0.0.1',
        userAgent: 'test',
      };

      const identifier = limiter.extractIdentifier(request, context);

      expect(identifier.type).toBe(RateLimitIdentifierType.USER_ID);
      expect(identifier.value).toBe('user-123');
    });

    it('should extract API key from headers', () => {
      const request = createMockRequest();
      request.headers.set('x-api-key', 'api-key-123');

      const identifier = limiter.extractIdentifier(request);

      expect(identifier.type).toBe(RateLimitIdentifierType.API_KEY);
      expect(identifier.value).toBe('api-key-123');
    });

    it('should default to IP address when no other identifier', () => {
      const request = createMockRequest();

      const identifier = limiter.extractIdentifier(request);

      expect(identifier.type).toBe(RateLimitIdentifierType.IP_ADDRESS);
      expect(identifier.value).toBe('127.0.0.1');
    });
  });

  describe('resetRateLimit', () => {
    it('should reset rate limit for specific identifier', () => {
      const request = createMockRequest();
      const identifier = {
        type: RateLimitIdentifierType.IP_ADDRESS,
        value: '127.0.0.1',
      };

      limiter.setRateLimitConfig({
        requestsPerWindow: 1,
        windowSizeMs: 60000,
        burstSize: 1,
        strategy: RateLimitStrategy.TOKEN_BUCKET,
      });

      limiter.checkRateLimit(request, undefined, identifier);
      limiter.resetRateLimit(identifier);

      const result = limiter.checkRateLimit(request, undefined, identifier);

      expect(result.allowed).toBe(true);
    });
  });

  describe('clearAllBuckets', () => {
    it('should clear all rate limit buckets', () => {
      const request = createMockRequest();
      limiter.setRateLimitConfig({
        requestsPerWindow: 1,
        windowSizeMs: 60000,
        burstSize: 1,
        strategy: RateLimitStrategy.TOKEN_BUCKET,
      });

      limiter.checkRateLimit(request);
      limiter.clearAllBuckets();

      const result = limiter.checkRateLimit(request);

      expect(result.allowed).toBe(true);
    });
  });
});

function createMockRequest(): HttpRequest {
  return {
    line: {
      method: HttpMethod.GET,
      path: '/',
      version: HttpVersion.HTTP_1_1,
    },
    headers: new Map([
      ['host', 'localhost'],
      ['user-agent', 'test-agent'],
    ]),
    body: Buffer.from(''),
    raw: Buffer.from('GET / HTTP/1.1\r\nHost: localhost\r\n\r\n'),
  };
}
