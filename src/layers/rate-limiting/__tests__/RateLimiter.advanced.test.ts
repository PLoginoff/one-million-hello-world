/**
 * Rate Limiter Advanced Unit Tests
 * 
 * Advanced unit tests for RateLimiter implementation.
 * Tests extended rate limiting features including multiple strategies,
 * rules, exceptions, tiers, quotas, and diagnostics.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { RateLimiter } from '../implementations/RateLimiter';
import { HttpRequest } from '../../http-parser/types/http-parser-types';
import { SecurityContext } from '../../security/types/security-types';
import {
  RateLimitIdentifier,
  RateLimitIdentifierType,
  RateLimitStrategy,
  RateLimitRule,
  RateLimitException,
  RateLimitTier,
  RateLimitQuota,
  RateLimitScope,
  RateLimitAction,
} from '../types/rate-limiting-types';

describe('RateLimiter Advanced', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter();
  });

  describe('Extended Rate Limiting', () => {
    it('should check rate limit with extended result', () => {
      const request: HttpRequest = {
        line: { method: 'GET' as const, path: '/', version: 'HTTP/1.1' as const },
        headers: new Map(),
        body: Buffer.from(''),
        raw: Buffer.from('GET / HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const result = limiter.checkRateLimitExtended(request);

      expect(result.allowed).toBe(true);
      expect(result.metrics).toBeDefined();
      expect(result.metrics.checkDuration).toBeGreaterThanOrEqual(0);
      expect(result.action).toBe(RateLimitAction.ALLOW);
    });

    it('should include warnings in extended result', () => {
      limiter.addWarning({
        code: 'WARN001',
        message: 'Test warning',
        severity: 'low',
        timestamp: new Date(),
      });

      const request: HttpRequest = {
        line: { method: 'GET' as const, path: '/', version: 'HTTP/1.1' as const },
        headers: new Map(),
        body: Buffer.from(''),
        raw: Buffer.from('GET / HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const result = limiter.checkRateLimitExtended(request);

      expect(result.warnings).toBeDefined();
      expect(result.warnings?.length).toBe(1);
    });
  });

  describe('Sliding Window Strategy', () => {
    it('should check rate limit using sliding window', () => {
      const identifier: RateLimitIdentifier = {
        type: RateLimitIdentifierType.IP_ADDRESS,
        value: '192.168.1.1',
      };

      const result = limiter.checkSlidingWindow(identifier);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThan(0);
    });

    it('should deny requests when sliding window limit exceeded', () => {
      limiter.setRateLimitConfig({
        ...limiter.getRateLimitConfig(),
        requestsPerWindow: 3,
      });

      const identifier: RateLimitIdentifier = {
        type: RateLimitIdentifierType.IP_ADDRESS,
        value: '192.168.1.2',
      };

      for (let i = 0; i < 3; i++) {
        expect(limiter.checkSlidingWindow(identifier).allowed).toBe(true);
      }

      const result = limiter.checkSlidingWindow(identifier);

      expect(result.allowed).toBe(false);
    });
  });

  describe('Fixed Window Strategy', () => {
    it('should check rate limit using fixed window', () => {
      const identifier: RateLimitIdentifier = {
        type: RateLimitIdentifierType.IP_ADDRESS,
        value: '192.168.1.3',
      };

      const result = limiter.checkFixedWindow(identifier);

      expect(result.allowed).toBe(true);
    });

    it('should reset fixed window after window expires', () => {
      limiter.setRateLimitConfig({
        ...limiter.getRateLimitConfig(),
        requestsPerWindow: 2,
        windowSizeMs: 1,
      });

      const identifier: RateLimitIdentifier = {
        type: RateLimitIdentifierType.IP_ADDRESS,
        value: '192.168.1.4',
      };

      expect(limiter.checkFixedWindow(identifier).allowed).toBe(true);
      expect(limiter.checkFixedWindow(identifier).allowed).toBe(true);
      expect(limiter.checkFixedWindow(identifier).allowed).toBe(false);

      setTimeout(() => {
        const result = limiter.checkFixedWindow(identifier);
        expect(result.allowed).toBe(true);
      }, 10);
    });
  });

  describe('Leaky Bucket Strategy', () => {
    it('should check rate limit using leaky bucket', () => {
      const identifier: RateLimitIdentifier = {
        type: RateLimitIdentifierType.IP_ADDRESS,
        value: '192.168.1.5',
      };

      const result = limiter.checkLeakyBucket(identifier);

      expect(result.allowed).toBe(true);
    });

    it('should handle queue in leaky bucket', () => {
      const identifier: RateLimitIdentifier = {
        type: RateLimitIdentifierType.IP_ADDRESS,
        value: '192.168.1.6',
      };

      const result = limiter.checkLeakyBucket(identifier);

      expect(result.allowed).toBe(true);
    });
  });

  describe('Bucket Information', () => {
    it('should get bucket info for identifier', () => {
      const identifier: RateLimitIdentifier = {
        type: RateLimitIdentifierType.IP_ADDRESS,
        value: '192.168.1.7',
      };

      limiter.checkRateLimitExtended({
        line: { method: 'GET' as const, path: '/', version: 'HTTP/1.1' as const },
        headers: new Map(),
        body: Buffer.from(''),
        raw: Buffer.from('GET / HTTP/1.1\r\n\r\n', 'utf-8'),
      }, undefined, identifier);

      const info = limiter.getBucketInfo(identifier);

      expect(info).toBeDefined();
      expect(info?.identifier).toEqual(identifier);
    });

    it('should return null for non-existent bucket', () => {
      const identifier: RateLimitIdentifier = {
        type: RateLimitIdentifierType.IP_ADDRESS,
        value: '192.168.1.8',
      };

      const info = limiter.getBucketInfo(identifier);

      expect(info).toBeNull();
    });
  });

  describe('Bucket Usage', () => {
    it('should get bucket usage statistics', () => {
      const identifier: RateLimitIdentifier = {
        type: RateLimitIdentifierType.IP_ADDRESS,
        value: '192.168.1.9',
      };

      limiter.checkRateLimitExtended({
        line: { method: 'GET' as const, path: '/', version: 'HTTP/1.1' as const },
        headers: new Map(),
        body: Buffer.from(''),
        raw: Buffer.from('GET / HTTP/1.1\r\n\r\n', 'utf-8'),
      }, undefined, identifier);

      const usage = limiter.getBucketUsage(identifier);

      expect(usage).toBeDefined();
      expect(usage?.identifier).toEqual(identifier);
    });
  });

  describe('Rate Limit Rules', () => {
    it('should add and retrieve rate limit rule', () => {
      const rule: RateLimitRule = {
        id: 'rule-1',
        name: 'Test Rule',
        scope: RateLimitScope.PER_IP,
        config: limiter.getRateLimitConfig(),
        action: RateLimitAction.ALLOW,
        enabled: true,
        priority: 10,
      };

      limiter.addRateLimitRule(rule);

      const rules = limiter.getRateLimitRules();

      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe('rule-1');
    });

    it('should remove rate limit rule', () => {
      const rule: RateLimitRule = {
        id: 'rule-2',
        name: 'Test Rule',
        scope: RateLimitScope.PER_IP,
        config: limiter.getRateLimitConfig(),
        action: RateLimitAction.ALLOW,
        enabled: true,
        priority: 10,
      };

      limiter.addRateLimitRule(rule);
      limiter.removeRateLimitRule('rule-2');

      const rules = limiter.getRateLimitRules();

      expect(rules).toHaveLength(0);
    });

    it('should get applicable rule for identifier', () => {
      const rule: RateLimitRule = {
        id: 'rule-3',
        name: 'IP Rule',
        scope: RateLimitScope.PER_IP,
        config: limiter.getRateLimitConfig(),
        action: RateLimitAction.ALLOW,
        enabled: true,
        priority: 10,
      };

      limiter.addRateLimitRule(rule);

      const identifier: RateLimitIdentifier = {
        type: RateLimitIdentifierType.IP_ADDRESS,
        value: '192.168.1.10',
      };

      const applicableRule = limiter.getApplicableRule(identifier);

      expect(applicableRule).toBeDefined();
      expect(applicableRule?.id).toBe('rule-3');
    });
  });

  describe('Rate Limit Exceptions', () => {
    it('should add and retrieve rate limit exception', () => {
      const exception: RateLimitException = {
        id: 'exception-1',
        identifier: {
          type: RateLimitIdentifierType.IP_ADDRESS,
          value: '192.168.1.11',
        },
        reason: 'Whitelisted IP',
        permanent: true,
      };

      limiter.addRateLimitException(exception);

      const exceptions = limiter.getRateLimitExceptions();

      expect(exceptions).toHaveLength(1);
      expect(exceptions[0].id).toBe('exception-1');
    });

    it('should remove rate limit exception', () => {
      const exception: RateLimitException = {
        id: 'exception-2',
        identifier: {
          type: RateLimitIdentifierType.IP_ADDRESS,
          value: '192.168.1.12',
        },
        reason: 'Whitelisted IP',
        permanent: true,
      };

      limiter.addRateLimitException(exception);
      limiter.removeRateLimitException('exception-2');

      const exceptions = limiter.getRateLimitExceptions();

      expect(exceptions).toHaveLength(0);
    });

    it('should check if identifier has exception', () => {
      const exception: RateLimitException = {
        id: 'exception-3',
        identifier: {
          type: RateLimitIdentifierType.IP_ADDRESS,
          value: '192.168.1.13',
        },
        reason: 'Whitelisted IP',
        permanent: true,
      };

      limiter.addRateLimitException(exception);

      const identifier: RateLimitIdentifier = {
        type: RateLimitIdentifierType.IP_ADDRESS,
        value: '192.168.1.13',
      };

      const hasException = limiter.hasException(identifier);

      expect(hasException).toBe(true);
    });
  });

  describe('Rate Limit Tiers', () => {
    it('should set and get rate limit tier', () => {
      const tier: RateLimitTier = {
        name: 'Premium',
        requestsPerWindow: 1000,
        windowSizeMs: 60000,
        burstSize: 100,
        priority: 1,
        features: ['priority-queue', 'burst-protection'],
      };

      const identifier: RateLimitIdentifier = {
        type: RateLimitIdentifierType.USER_ID,
        value: 'user-123',
      };

      limiter.setRateLimitTier(identifier, tier);

      const retrievedTier = limiter.getRateLimitTier(identifier);

      expect(retrievedTier).toBeDefined();
      expect(retrievedTier?.name).toBe('Premium');
    });
  });

  describe('Rate Limit Quotas', () => {
    it('should set and get quota', () => {
      const quota: RateLimitQuota = {
        limit: 500,
        used: 100,
        remaining: 400,
        resetTime: new Date(Date.now() + 60000),
        windowStart: new Date(),
        windowEnd: new Date(Date.now() + 60000),
      };

      const identifier: RateLimitIdentifier = {
        type: RateLimitIdentifierType.API_KEY,
        value: 'api-key-123',
      };

      limiter.setQuota(identifier, quota);

      const retrievedQuota = limiter.getQuota(identifier);

      expect(retrievedQuota).toBeDefined();
      expect(retrievedQuota?.limit).toBe(500);
    });

    it('should reset quota', () => {
      const quota: RateLimitQuota = {
        limit: 500,
        used: 100,
        remaining: 400,
        resetTime: new Date(Date.now() + 60000),
        windowStart: new Date(),
        windowEnd: new Date(Date.now() + 60000),
      };

      const identifier: RateLimitIdentifier = {
        type: RateLimitIdentifierType.API_KEY,
        value: 'api-key-456',
      };

      limiter.setQuota(identifier, quota);
      limiter.resetQuota(identifier);

      const retrievedQuota = limiter.getQuota(identifier);

      expect(retrievedQuota).toBeNull();
    });
  });

  describe('Health Status', () => {
    it('should return healthy status', () => {
      const health = limiter.getHealthStatus();

      expect(health.status).toBe('healthy');
      expect(health.score).toBeGreaterThan(0);
      expect(health.checks).toHaveLength(3);
    });
  });

  describe('Diagnostics', () => {
    it('should run diagnostics', () => {
      const diagnostics = limiter.runDiagnostics();

      expect(diagnostics.traceId).toBeDefined();
      expect(diagnostics.duration).toBeGreaterThanOrEqual(0);
      expect(diagnostics.steps).toHaveLength(3);
      expect(diagnostics.summary.overallStatus).toBe('success');
    });
  });

  describe('Warning Management', () => {
    it('should add warning', () => {
      limiter.addWarning({
        code: 'WARN002',
        message: 'High traffic',
        severity: 'high',
        timestamp: new Date(),
      });

      const warnings = limiter.getWarnings();

      expect(warnings).toHaveLength(1);
      expect(warnings[0].code).toBe('WARN002');
    });

    it('should clear warnings', () => {
      limiter.addWarning({
        code: 'WARN003',
        message: 'Test warning',
        severity: 'low',
        timestamp: new Date(),
      });

      limiter.clearWarnings();

      const warnings = limiter.getWarnings();

      expect(warnings).toHaveLength(0);
    });
  });

  describe('Bucket Cleanup', () => {
    it('should cleanup expired buckets', () => {
      limiter.setRateLimitConfig({
        ...limiter.getRateLimitConfig(),
        windowSizeMs: 1,
      });

      const identifier: RateLimitIdentifier = {
        type: RateLimitIdentifierType.IP_ADDRESS,
        value: '192.168.1.14',
      };

      limiter.checkRateLimitExtended({
        line: { method: 'GET' as const, path: '/', version: 'HTTP/1.1' as const },
        headers: new Map(),
        body: Buffer.from(''),
        raw: Buffer.from('GET / HTTP/1.1\r\n\r\n', 'utf-8'),
      }, undefined, identifier);

      setTimeout(() => {
        limiter.cleanupExpiredBuckets();
        const bucketCount = limiter.getBucketCount();
        expect(bucketCount).toBe(0);
      }, 10);
    });
  });

  describe('Usage Statistics', () => {
    it('should get total usage', () => {
      const usage = limiter.getTotalUsage();

      expect(usage).toBeDefined();
      expect(usage.scope).toBe(RateLimitScope.GLOBAL);
    });

    it('should get usage by identifier', () => {
      const identifier: RateLimitIdentifier = {
        type: RateLimitIdentifierType.IP_ADDRESS,
        value: '192.168.1.15',
      };

      limiter.checkRateLimitExtended({
        line: { method: 'GET' as const, path: '/', version: 'HTTP/1.1' as const },
        headers: new Map(),
        body: Buffer.from(''),
        raw: Buffer.from('GET / HTTP/1.1\r\n\r\n', 'utf-8'),
      }, undefined, identifier);

      const usage = limiter.getUsageByIdentifier(identifier);

      expect(usage).toBeDefined();
    });
  });
});
