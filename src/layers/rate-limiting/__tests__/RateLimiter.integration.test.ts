/**
 * Rate Limiter Integration Tests
 * 
 * Integration tests for RateLimiter implementation.
 * Tests full rate limiting workflows, configuration chaining, statistics tracking, and advanced features.
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
  RateLimitConfig,
} from '../types/rate-limiting-types';

describe('RateLimiter Integration', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter();
  });

  describe('Full Rate Limit Workflow', () => {
    it('should complete full workflow with configuration, rate limiting, and statistics', () => {
      limiter.setRateLimitConfig({
        requestsPerWindow: 50,
        windowSizeMs: 30000,
        burstSize: 5,
        strategy: RateLimitStrategy.TOKEN_BUCKET,
        enabled: true,
        skipSuccessfulRequests: false,
        skipFailedRequests: false,
        enableBurstProtection: true,
        enableGracePeriod: false,
        gracePeriodMs: 0,
        enablePriorityQueuing: false,
        maxQueueSize: 50,
      });

      const identifier: RateLimitIdentifier = {
        type: RateLimitIdentifierType.IP_ADDRESS,
        value: '192.168.1.100',
      };

      for (let i = 0; i < 10; i++) {
        const result = limiter.checkRateLimitExtended({
          line: { method: 'GET' as const, path: '/api/test', version: 'HTTP/1.1' as const },
          headers: new Map(),
          body: Buffer.from(''),
          raw: Buffer.from('GET /api/test HTTP/1.1\r\n\r\n', 'utf-8'),
        }, undefined, identifier);
        expect(result.allowed).toBe(true);
      }

      const stats = limiter.getStats();
      expect(stats.totalRequests).toBe(10);
      expect(stats.allowedRequests).toBe(10);
    });
  });

  describe('Configuration Chaining', () => {
    it('should support configuration updates during operation', () => {
      limiter.setRateLimitConfig({
        ...limiter.getRateLimitConfig(),
        requestsPerWindow: 10,
      });

      const identifier: RateLimitIdentifier = {
        type: RateLimitIdentifierType.USER_ID,
        value: 'user-1',
      };

      for (let i = 0; i < 5; i++) {
        limiter.checkRateLimitExtended({
          line: { method: 'POST' as const, path: '/api/data', version: 'HTTP/1.1' as const },
          headers: new Map(),
          body: Buffer.from(''),
          raw: Buffer.from('POST /api/data HTTP/1.1\r\n\r\n', 'utf-8'),
        }, undefined, identifier);
      }

      limiter.setRateLimitConfig({
        ...limiter.getRateLimitConfig(),
        requestsPerWindow: 20,
      });

      const result = limiter.checkRateLimitExtended({
        line: { method: 'GET' as const, path: '/api/data', version: 'HTTP/1.1' as const },
        headers: new Map(),
        body: Buffer.from(''),
        raw: Buffer.from('GET /api/data HTTP/1.1\r\n\r\n', 'utf-8'),
      }, undefined, identifier);

      expect(result.allowed).toBe(true);
    });
  });

  describe('Statistics Tracking', () => {
    it('should track statistics across multiple identifiers', () => {
      const identifiers = [
        { type: RateLimitIdentifierType.IP_ADDRESS, value: '192.168.1.10' },
        { type: RateLimitIdentifierType.IP_ADDRESS, value: '192.168.1.11' },
        { type: RateLimitIdentifierType.USER_ID, value: 'user-2' },
      ];

      identifiers.forEach((id) => {
        for (let i = 0; i < 5; i++) {
          limiter.checkRateLimitExtended({
            line: { method: 'GET' as const, path: '/api/stats', version: 'HTTP/1.1' as const },
            headers: new Map(),
            body: Buffer.from(''),
            raw: Buffer.from('GET /api/stats HTTP/1.1\r\n\r\n', 'utf-8'),
          }, undefined, id as RateLimitIdentifier);
        }
      });

      const stats = limiter.getStats();
      expect(stats.totalRequests).toBe(15);
      expect(stats.allowedRequests).toBe(15);
      expect(stats.currentBuckets).toBe(3);
    });
  });

  describe('Health Status Integration', () => {
    it('should provide accurate health status based on system state', () => {
      limiter.setRateLimitConfig({
        ...limiter.getRateLimitConfig(),
        enabled: false,
      });

      const health = limiter.getHealthStatus();

      expect(health.status).toBe('degraded');
      expect(health.score).toBeLessThan(100);
      expect(health.checks.length).toBeGreaterThan(0);
    });
  });

  describe('Diagnostics Integration', () => {
    it('should provide comprehensive diagnostics', () => {
      const identifier: RateLimitIdentifier = {
        type: RateLimitIdentifierType.API_KEY,
        value: 'api-key-diag',
      };

      limiter.checkRateLimitExtended({
        line: { method: 'GET' as const, path: '/api/diag', version: 'HTTP/1.1' as const },
        headers: new Map(),
        body: Buffer.from(''),
        raw: Buffer.from('GET /api/diag HTTP/1.1\r\n\r\n', 'utf-8'),
      }, undefined, identifier);

      const diagnostics = limiter.runDiagnostics();

      expect(diagnostics.traceId).toBeDefined();
      expect(diagnostics.steps.length).toBeGreaterThan(0);
      expect(diagnostics.summary.overallStatus).toBe('success');
    });
  });

  describe('Rules and Exceptions Integration', () => {
    it('should apply rules and exceptions correctly', () => {
      const rule: RateLimitRule = {
        id: 'rule-integration',
        name: 'Integration Rule',
        scope: RateLimitScope.PER_IP,
        config: limiter.getRateLimitConfig(),
        action: RateLimitAction.ALLOW,
        enabled: true,
        priority: 100,
      };

      limiter.addRateLimitRule(rule);

      const exception: RateLimitException = {
        id: 'exception-integration',
        identifier: {
          type: RateLimitIdentifierType.IP_ADDRESS,
          value: '192.168.1.200',
        },
        reason: 'Integration test exception',
        permanent: true,
      };

      limiter.addRateLimitException(exception);

      const identifier: RateLimitIdentifier = {
        type: RateLimitIdentifierType.IP_ADDRESS,
        value: '192.168.1.200',
      };

      const hasException = limiter.hasException(identifier);
      const applicableRule = limiter.getApplicableRule(identifier);

      expect(hasException).toBe(true);
      expect(applicableRule).toBeDefined();
      expect(applicableRule?.id).toBe('rule-integration');
    });
  });

  describe('Tiers and Quotas Integration', () => {
    it('should manage tiers and quotas together', () => {
      const tier: RateLimitTier = {
        name: 'Integration Tier',
        requestsPerWindow: 500,
        windowSizeMs: 60000,
        burstSize: 50,
        priority: 1,
        features: ['burst-protection', 'priority-queue'],
      };

      const quota: RateLimitQuota = {
        limit: 1000,
        used: 100,
        remaining: 900,
        resetTime: new Date(Date.now() + 60000),
        windowStart: new Date(),
        windowEnd: new Date(Date.now() + 60000),
      };

      const identifier: RateLimitIdentifier = {
        type: RateLimitIdentifierType.USER_ID,
        value: 'user-integration',
      };

      limiter.setRateLimitTier(identifier, tier);
      limiter.setQuota(identifier, quota);

      const retrievedTier = limiter.getRateLimitTier(identifier);
      const retrievedQuota = limiter.getQuota(identifier);

      expect(retrievedTier?.name).toBe('Integration Tier');
      expect(retrievedQuota?.limit).toBe(1000);
    });
  });

  describe('Multiple Strategies Integration', () => {
    it('should handle multiple strategies for different identifiers', () => {
      limiter.setRateLimitConfig({
        ...limiter.getRateLimitConfig(),
        strategy: RateLimitStrategy.TOKEN_BUCKET,
      });

      const identifier1: RateLimitIdentifier = {
        type: RateLimitIdentifierType.IP_ADDRESS,
        value: '192.168.1.50',
      };

      limiter.checkRateLimitExtended({
        line: { method: 'GET' as const, path: '/api/strategies', version: 'HTTP/1.1' as const },
        headers: new Map(),
        body: Buffer.from(''),
        raw: Buffer.from('GET /api/strategies HTTP/1.1\r\n\r\n', 'utf-8'),
      }, undefined, identifier1);

      limiter.setRateLimitConfig({
        ...limiter.getRateLimitConfig(),
        strategy: RateLimitStrategy.SLIDING_WINDOW,
      });

      const identifier2: RateLimitIdentifier = {
        type: RateLimitIdentifierType.USER_ID,
        value: 'user-strategy',
      };

      const result = limiter.checkSlidingWindow(identifier2);

      expect(result).toBeDefined();
    });
  });

  describe('Warning System Integration', () => {
    it('should integrate warnings with rate limiting', () => {
      limiter.addWarning({
        code: 'WARN_INTEGRATION',
        message: 'Integration test warning',
        severity: 'medium',
        timestamp: new Date(),
      });

      const identifier: RateLimitIdentifier = {
        type: RateLimitIdentifierType.IP_ADDRESS,
        value: '192.168.1.150',
      };

      const result = limiter.checkRateLimitExtended({
        line: { method: 'GET' as const, path: '/api/warning', version: 'HTTP/1.1' as const },
        headers: new Map(),
        body: Buffer.from(''),
        raw: Buffer.from('GET /api/warning HTTP/1.1\r\n\r\n', 'utf-8'),
      }, undefined, identifier);

      expect(result.warnings).toBeDefined();
      expect(result.warnings?.length).toBe(1);
    });
  });

  describe('Cleanup Integration', () => {
    it('should cleanup expired buckets and maintain system health', () => {
      limiter.setRateLimitConfig({
        ...limiter.getRateLimitConfig(),
        windowSizeMs: 1,
      });

      const identifier: RateLimitIdentifier = {
        type: RateLimitIdentifierType.IP_ADDRESS,
        value: '192.168.1.175',
      };

      limiter.checkRateLimitExtended({
        line: { method: 'GET' as const, path: '/api/cleanup', version: 'HTTP/1.1' as const },
        headers: new Map(),
        body: Buffer.from(''),
        raw: Buffer.from('GET /api/cleanup HTTP/1.1\r\n\r\n', 'utf-8'),
      }, undefined, identifier);

      setTimeout(() => {
        limiter.cleanupExpiredBuckets();
        const bucketCount = limiter.getBucketCount();
        expect(bucketCount).toBeLessThan(2);
      }, 10);
    });
  });

  describe('Usage Tracking Integration', () => {
    it('should track usage across all identifiers', () => {
      const identifiers = [
        { type: RateLimitIdentifierType.IP_ADDRESS, value: '192.168.1.20' },
        { type: RateLimitIdentifierType.USER_ID, value: 'user-usage' },
        { type: RateLimitIdentifierType.API_KEY, value: 'key-usage' },
      ];

      identifiers.forEach((id) => {
        limiter.checkRateLimitExtended({
          line: { method: 'GET' as const, path: '/api/usage', version: 'HTTP/1.1' as const },
          headers: new Map(),
          body: Buffer.from(''),
          raw: Buffer.from('GET /api/usage HTTP/1.1\r\n\r\n', 'utf-8'),
        }, undefined, id as RateLimitIdentifier);
      });

      const totalUsage = limiter.getTotalUsage();

      expect(totalUsage.requests).toBe(3);
      expect(totalUsage.scope).toBe(RateLimitScope.GLOBAL);
    });
  });

  describe('Security Context Integration', () => {
    it('should integrate with security context for user-based limiting', () => {
      const context: SecurityContext = {
        isAuthenticated: true,
        userId: 'user-security',
        roles: ['user'],
        permissions: [],
      };

      const request: HttpRequest = {
        line: { method: 'GET' as const, path: '/api/security', version: 'HTTP/1.1' as const },
        headers: new Map(),
        body: Buffer.from(''),
        raw: Buffer.from('GET /api/security HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const result = limiter.checkRateLimitExtended(request, context);

      expect(result).toBeDefined();
      expect(result.allowed).toBe(true);
    });
  });
});
