/**
 * Rate Limiter Edge Cases Unit Tests
 * 
 * Edge case unit tests for RateLimiter implementation.
 * Tests error handling, empty inputs, malformed inputs, and boundary values.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { RateLimiter } from '../implementations/RateLimiter';
import { HttpRequest } from '../../http-parser/types/http-parser-types';
import { RateLimitIdentifier, RateLimitIdentifierType, RateLimitStrategy } from '../types/rate-limiting-types';

describe('RateLimiter Edge Cases', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter();
  });

  describe('Configuration Edge Cases', () => {
    it('should handle zero requests per window', () => {
      limiter.setRateLimitConfig({
        ...limiter.getRateLimitConfig(),
        requestsPerWindow: 0,
      });

      const identifier: RateLimitIdentifier = {
        type: RateLimitIdentifierType.IP_ADDRESS,
        value: '192.168.1.1',
      };

      const result = limiter.checkRateLimitExtended({
        line: { method: 'GET' as const, path: '/', version: 'HTTP/1.1' as const },
        headers: new Map(),
        body: Buffer.from(''),
        raw: Buffer.from('GET / HTTP/1.1\r\n\r\n', 'utf-8'),
      }, undefined, identifier);

      expect(result.allowed).toBe(false);
    });

    it('should handle very large window size', () => {
      limiter.setRateLimitConfig({
        ...limiter.getRateLimitConfig(),
        windowSizeMs: Number.MAX_SAFE_INTEGER,
      });

      const config = limiter.getRateLimitConfig();

      expect(config.windowSizeMs).toBe(Number.MAX_SAFE_INTEGER);
    });
  });

  describe('Identifier Edge Cases', () => {
    it('should handle empty identifier value', () => {
      const identifier: RateLimitIdentifier = {
        type: RateLimitIdentifierType.IP_ADDRESS,
        value: '',
      };

      const result = limiter.checkRateLimitExtended({
        line: { method: 'GET' as const, path: '/', version: 'HTTP/1.1' as const },
        headers: new Map(),
        body: Buffer.from(''),
        raw: Buffer.from('GET / HTTP/1.1\r\n\r\n', 'utf-8'),
      }, undefined, identifier);

      expect(result).toBeDefined();
    });

    it('should handle very long identifier value', () => {
      const longValue = 'a'.repeat(10000);
      const identifier: RateLimitIdentifier = {
        type: RateLimitIdentifierType.CUSTOM,
        value: longValue,
      };

      const result = limiter.checkRateLimitExtended({
        line: { method: 'GET' as const, path: '/', version: 'HTTP/1.1' as const },
        headers: new Map(),
        body: Buffer.from(''),
        raw: Buffer.from('GET / HTTP/1.1\r\n\r\n', 'utf-8'),
      }, undefined, identifier);

      expect(result).toBeDefined();
    });
  });

  describe('Strategy Edge Cases', () => {
    it('should handle strategy switching mid-operation', () => {
      limiter.setRateLimitConfig({
        ...limiter.getRateLimitConfig(),
        strategy: RateLimitStrategy.TOKEN_BUCKET,
      });

      const identifier: RateLimitIdentifier = {
        type: RateLimitIdentifierType.IP_ADDRESS,
        value: '192.168.1.2',
      };

      limiter.checkRateLimitExtended({
        line: { method: 'GET' as const, path: '/', version: 'HTTP/1.1' as const },
        headers: new Map(),
        body: Buffer.from(''),
        raw: Buffer.from('GET / HTTP/1.1\r\n\r\n', 'utf-8'),
      }, undefined, identifier);

      limiter.setRateLimitConfig({
        ...limiter.getRateLimitConfig(),
        strategy: RateLimitStrategy.SLIDING_WINDOW,
      });

      const result = limiter.checkSlidingWindow(identifier);

      expect(result).toBeDefined();
    });
  });

  describe('Bucket Edge Cases', () => {
    it('should handle bucket reset for non-existent bucket', () => {
      const identifier: RateLimitIdentifier = {
        type: RateLimitIdentifierType.IP_ADDRESS,
        value: '192.168.1.3',
      };

      limiter.resetRateLimit(identifier);

      expect(limiter.getBucketCount()).toBe(0);
    });

    it('should handle clearing all buckets when empty', () => {
      limiter.clearAllBuckets();

      expect(limiter.getBucketCount()).toBe(0);
    });

    it('should handle getting bucket info for non-existent bucket', () => {
      const identifier: RateLimitIdentifier = {
        type: RateLimitIdentifierType.IP_ADDRESS,
        value: '192.168.1.4',
      };

      const info = limiter.getBucketInfo(identifier);

      expect(info).toBeNull();
    });
  });

  describe('Statistics Edge Cases', () => {
    it('should handle zero total requests', () => {
      const stats = limiter.getStats();

      expect(stats.totalRequests).toBe(0);
    });

    it('should handle stats reset during operation', () => {
      const identifier: RateLimitIdentifier = {
        type: RateLimitIdentifierType.IP_ADDRESS,
        value: '192.168.1.5',
      };

      limiter.checkRateLimitExtended({
        line: { method: 'GET' as const, path: '/', version: 'HTTP/1.1' as const },
        headers: new Map(),
        body: Buffer.from(''),
        raw: Buffer.from('GET / HTTP/1.1\r\n\r\n', 'utf-8'),
      }, undefined, identifier);

      limiter.resetStats();

      const stats = limiter.getStats();

      expect(stats.totalRequests).toBe(0);
    });
  });

  describe('Rule Edge Cases', () => {
    it('should handle removing non-existent rule', () => {
      limiter.removeRateLimitRule('non-existent-rule');

      const rules = limiter.getRateLimitRules();

      expect(rules).toHaveLength(0);
    });

    it('should handle getting rules when empty', () => {
      const rules = limiter.getRateLimitRules();

      expect(rules).toHaveLength(0);
    });

    it('should handle getting applicable rule with no rules', () => {
      const identifier: RateLimitIdentifier = {
        type: RateLimitIdentifierType.IP_ADDRESS,
        value: '192.168.1.6',
      };

      const rule = limiter.getApplicableRule(identifier);

      expect(rule).toBeNull();
    });
  });

  describe('Exception Edge Cases', () => {
    it('should handle removing non-existent exception', () => {
      limiter.removeRateLimitException('non-existent-exception');

      const exceptions = limiter.getRateLimitExceptions();

      expect(exceptions).toHaveLength(0);
    });

    it('should handle checking exception for non-existent identifier', () => {
      const identifier: RateLimitIdentifier = {
        type: RateLimitIdentifierType.IP_ADDRESS,
        value: '192.168.1.7',
      };

      const hasException = limiter.hasException(identifier);

      expect(hasException).toBe(false);
    });

    it('should handle expired exception', () => {
      const exception = {
        id: 'exception-expired',
        identifier: {
          type: RateLimitIdentifierType.IP_ADDRESS,
          value: '192.168.1.8',
        },
        reason: 'Test',
        expiresAt: new Date(Date.now() - 1000),
        permanent: false,
      };

      limiter.addRateLimitException(exception);

      const identifier: RateLimitIdentifier = {
        type: RateLimitIdentifierType.IP_ADDRESS,
        value: '192.168.1.8',
      };

      const hasException = limiter.hasException(identifier);

      expect(hasException).toBe(false);
    });
  });

  describe('Tier Edge Cases', () => {
    it('should handle getting tier for non-existent identifier', () => {
      const identifier: RateLimitIdentifier = {
        type: RateLimitIdentifierType.USER_ID,
        value: 'user-999',
      };

      const tier = limiter.getRateLimitTier(identifier);

      expect(tier).toBeNull();
    });
  });

  describe('Quota Edge Cases', () => {
    it('should handle resetting quota for non-existent identifier', () => {
      const identifier: RateLimitIdentifier = {
        type: RateLimitIdentifierType.API_KEY,
        value: 'api-key-999',
      };

      limiter.resetQuota(identifier);

      const quota = limiter.getQuota(identifier);

      expect(quota).toBeNull();
    });

    it('should handle getting quota for non-existent identifier', () => {
      const identifier: RateLimitIdentifier = {
        type: RateLimitIdentifierType.API_KEY,
        value: 'api-key-888',
      };

      const quota = limiter.getQuota(identifier);

      expect(quota).toBeNull();
    });
  });

  describe('Warning Edge Cases', () => {
    it('should handle clearing warnings when empty', () => {
      limiter.clearWarnings();

      const warnings = limiter.getWarnings();

      expect(warnings).toHaveLength(0);
    });
  });

  describe('Usage Edge Cases', () => {
    it('should handle getting usage for non-existent identifier', () => {
      const identifier: RateLimitIdentifier = {
        type: RateLimitIdentifierType.IP_ADDRESS,
        value: '192.168.1.9',
      };

      const usage = limiter.getUsageByIdentifier(identifier);

      expect(usage).toBeNull();
    });
  });

  describe('Health Status Edge Cases', () => {
    it('should handle degraded status when rate limiting disabled', () => {
      limiter.setRateLimitConfig({
        ...limiter.getRateLimitConfig(),
        enabled: false,
      });

      const health = limiter.getHealthStatus();

      expect(health.status).toBe('degraded');
    });
  });

  describe('Diagnostics Edge Cases', () => {
    it('should handle diagnostics with no buckets', () => {
      const diagnostics = limiter.runDiagnostics();

      expect(diagnostics.summary.overallStatus).toBe('success');
    });
  });

  describe('Cleanup Edge Cases', () => {
    it('should handle cleanup when no buckets exist', () => {
      limiter.cleanupExpiredBuckets();

      expect(limiter.getBucketCount()).toBe(0);
    });
  });
});
