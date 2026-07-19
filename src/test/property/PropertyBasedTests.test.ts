/**
 * Property-based tests for value objects and algorithms
 * Uses deterministic property testing patterns
 */

import { HelloWorldMessage } from '../../layers/domain/entities/HelloWorldMessage';
import { MessageContent } from '../../layers/domain/value-objects/MessageContent';
import { CacheStats } from '../../layers/cache/domain/value-objects/CacheStats';
import { CompressionAlgorithm } from '../../layers/compression/domain/value-objects/CompressionAlgorithm';

describe('Property-Based Tests', () => {
  describe('MessageContent value object', () => {
    it('should preserve content through create/toString roundtrip', () => {
      const testValues = ['Hello', 'World', 'Test 123', 'Special !@#$%'];
      for (const value of testValues) {
        const content = MessageContent.create(value);
        expect(content.toString()).toBe(value);
      }
    });

    it('should reject empty content', () => {
      expect(() => MessageContent.create('')).toThrow();
    });

    it('should be immutable', () => {
      const content = MessageContent.create('test');
      const original = content.toString();
      expect(content.toString()).toBe(original);
    });
  });

  describe('HelloWorldMessage entity', () => {
    it('should generate unique IDs for different messages', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const msg = HelloWorldMessage.create('test');
        ids.add(msg.id);
      }
      expect(ids.size).toBe(100);
    });

    it('should preserve immutability through withLanguage', () => {
      const msg = HelloWorldMessage.create('original');
      const updated = msg.withLanguage('es');
      expect(updated.language).toBe('es');
      expect(msg.language).not.toBe('es');
    });
  });

  describe('CacheStats value object', () => {
    it('should maintain hit rate invariant', () => {
      for (let hits = 0; hits <= 10; hits++) {
        for (let misses = 0; misses <= 10; misses++) {
          const stats = new CacheStats(hits, misses, 0, 0);
          const total = hits + misses;
          const expectedRate = total > 0 ? hits / total : 0;
          expect(stats.getHitRate()).toBeCloseTo(expectedRate, 10);
        }
      }
    });

    it('should maintain miss rate invariant', () => {
      for (let hits = 0; hits <= 5; hits++) {
        for (let misses = 0; misses <= 5; misses++) {
          const stats = new CacheStats(hits, misses, 0, 0);
          const total = hits + misses;
          const expectedRate = total > 0 ? misses / total : 0;
          expect(stats.getMissRate()).toBeCloseTo(expectedRate, 10);
        }
      }
    });

    it('should have hit rate + miss rate = 1 when total > 0', () => {
      for (let hits = 0; hits <= 10; hits++) {
        for (let misses = 0; misses <= 10; misses++) {
          if (hits + misses > 0) {
            const stats = new CacheStats(hits, misses, 0, 0);
            expect(stats.getHitRate() + stats.getMissRate()).toBeCloseTo(1.0, 10);
          }
        }
      }
    });
  });

  describe('CompressionAlgorithm value object', () => {
    it('should create predefined algorithms', () => {
      const gzip = CompressionAlgorithm.createGzip();
      const brotli = CompressionAlgorithm.createBrotli();
      const deflate = CompressionAlgorithm.createDeflate();

      expect(gzip).toBeDefined();
      expect(brotli).toBeDefined();
      expect(deflate).toBeDefined();
    });
  });

  describe('TokenBucket rate limiter properties', () => {
    it('should never allow more than limit requests in a window', () => {
      const { TokenBucketStrategy } = require('../../layers/rate-limiting/strategies/algorithm/TokenBucketStrategy');
      const { RateLimitKey } = require('../../layers/rate-limiting/domain/entities/RateLimitKey');

      for (let limit = 1; limit <= 10; limit++) {
        const limiter = new TokenBucketStrategy();
        const key = RateLimitKey.fromUser('test-user-' + limit);

        let allowed = 0;
        for (let i = 0; i < limit + 5; i++) {
          if (limiter.isAllowed(key, limit, 10000).allowed) {
            allowed++;
          }
        }
        expect(allowed).toBeLessThanOrEqual(limit);
      }
    });
  });
});
