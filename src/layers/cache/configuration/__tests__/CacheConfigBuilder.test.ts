/**
 * CacheConfigBuilder Unit Tests
 * 
 * Tests for CacheConfigBuilder using AAA pattern.
 */

import { CacheConfigBuilder } from '../builders/CacheConfigBuilder';
import { InvalidationStrategy } from '../../types/cache-types';

describe('CacheConfigBuilder', () => {
  describe('create', () => {
    it('should create builder with default configuration', () => {
      const builder = CacheConfigBuilder.create();
      
      expect(builder).toBeDefined();
    });

    it('should build default configuration', () => {
      const config = CacheConfigBuilder.create().build();
      
      expect(config.maxSize).toBe(1000);
      expect(config.defaultTTL).toBe(60000);
      expect(config.invalidationStrategy).toBe(InvalidationStrategy.LRU);
      expect(config.enableMultiLevel).toBe(false);
    });
  });

  describe('highPerformance', () => {
    it('should create builder with high-performance configuration', () => {
      const config = CacheConfigBuilder.highPerformance().build();
      
      expect(config.maxSize).toBe(100);
      expect(config.defaultTTL).toBe(30000);
      expect(config.invalidationStrategy).toBe(InvalidationStrategy.LRU);
      expect(config.enableMultiLevel).toBe(false);
    });
  });

  describe('largeCache', () => {
    it('should create builder with large cache configuration', () => {
      const config = CacheConfigBuilder.largeCache().build();
      
      expect(config.maxSize).toBe(10000);
      expect(config.defaultTTL).toBe(300000);
      expect(config.invalidationStrategy).toBe(InvalidationStrategy.LFU);
      expect(config.enableMultiLevel).toBe(false);
    });
  });

  describe('multiLevel', () => {
    it('should create builder with multi-level configuration', () => {
      const config = CacheConfigBuilder.multiLevel().build();
      
      expect(config.maxSize).toBe(1000);
      expect(config.defaultTTL).toBe(60000);
      expect(config.invalidationStrategy).toBe(InvalidationStrategy.LRU);
      expect(config.enableMultiLevel).toBe(true);
    });
  });

  describe('withMaxSize', () => {
    it('should set maxSize', () => {
      const config = CacheConfigBuilder.create()
        .withMaxSize(500)
        .build();
      
      expect(config.maxSize).toBe(500);
    });

    it('should chain withMaxSize', () => {
      const config = CacheConfigBuilder.create()
        .withMaxSize(500)
        .withMaxSize(1000)
        .build();
      
      expect(config.maxSize).toBe(1000);
    });
  });

  describe('withDefaultTTL', () => {
    it('should set defaultTTL in milliseconds', () => {
      const config = CacheConfigBuilder.create()
        .withDefaultTTL(30000)
        .build();
      
      expect(config.defaultTTL).toBe(30000);
    });

    it('should chain withDefaultTTL', () => {
      const config = CacheConfigBuilder.create()
        .withDefaultTTL(30000)
        .withDefaultTTL(60000)
        .build();
      
      expect(config.defaultTTL).toBe(60000);
    });
  });

  describe('withDefaultTTLSeconds', () => {
    it('should set defaultTTL from seconds', () => {
      const config = CacheConfigBuilder.create()
        .withDefaultTTLSeconds(60)
        .build();
      
      expect(config.defaultTTL).toBe(60000);
    });

    it('should convert correctly', () => {
      const config = CacheConfigBuilder.create()
        .withDefaultTTLSeconds(120)
        .build();
      
      expect(config.defaultTTL).toBe(120000);
    });
  });

  describe('withInvalidationStrategy', () => {
    it('should set invalidationStrategy', () => {
      const config = CacheConfigBuilder.create()
        .withInvalidationStrategy(InvalidationStrategy.LFU)
        .build();
      
      expect(config.invalidationStrategy).toBe(InvalidationStrategy.LFU);
    });

    it('should chain withInvalidationStrategy', () => {
      const config = CacheConfigBuilder.create()
        .withInvalidationStrategy(InvalidationStrategy.LFU)
        .withInvalidationStrategy(InvalidationStrategy.LRU)
        .build();
      
      expect(config.invalidationStrategy).toBe(InvalidationStrategy.LRU);
    });
  });

  describe('withMultiLevel', () => {
    it('should enable multi-level', () => {
      const config = CacheConfigBuilder.create()
        .withMultiLevel(true)
        .build();
      
      expect(config.enableMultiLevel).toBe(true);
    });

    it('should disable multi-level', () => {
      const config = CacheConfigBuilder.create()
        .withMultiLevel(false)
        .build();
      
      expect(config.enableMultiLevel).toBe(false);
    });
  });

  describe('build', () => {
    it('should validate configuration', () => {
      expect(() => {
        CacheConfigBuilder.create()
          .withMaxSize(-1)
          .build();
      }).toThrow();
    });

    it('should return valid configuration', () => {
      const config = CacheConfigBuilder.create()
        .withMaxSize(500)
        .withDefaultTTLSeconds(60)
        .withInvalidationStrategy(InvalidationStrategy.LFU)
        .withMultiLevel(false)
        .build();
      
      expect(config.maxSize).toBe(500);
      expect(config.defaultTTL).toBe(60000);
      expect(config.invalidationStrategy).toBe(InvalidationStrategy.LFU);
      expect(config.enableMultiLevel).toBe(false);
    });
  });

  describe('buildUnsafe', () => {
    it('should skip validation', () => {
      const config = CacheConfigBuilder.create()
        .withMaxSize(-1)
        .buildUnsafe();
      
      expect(config.maxSize).toBe(-1);
    });

    it('should return configuration', () => {
      const config = CacheConfigBuilder.create()
        .withMaxSize(500)
        .buildUnsafe();
      
      expect(config.maxSize).toBe(500);
    });
  });

  describe('method chaining', () => {
    it('should support fluent API', () => {
      const config = CacheConfigBuilder.create()
        .withMaxSize(500)
        .withDefaultTTLSeconds(60)
        .withInvalidationStrategy(InvalidationStrategy.LFU)
        .withMultiLevel(true)
        .build();
      
      expect(config.maxSize).toBe(500);
      expect(config.defaultTTL).toBe(60000);
      expect(config.invalidationStrategy).toBe(InvalidationStrategy.LFU);
      expect(config.enableMultiLevel).toBe(true);
    });
  });

  describe('complex scenarios', () => {
    it('should override high-performance settings', () => {
      const config = CacheConfigBuilder.highPerformance()
        .withMaxSize(200)
        .build();
      
      expect(config.maxSize).toBe(200);
      expect(config.defaultTTL).toBe(30000);
    });

    it('should override large cache settings', () => {
      const config = CacheConfigBuilder.largeCache()
        .withInvalidationStrategy(InvalidationStrategy.LRU)
        .build();
      
      expect(config.maxSize).toBe(10000);
      expect(config.invalidationStrategy).toBe(InvalidationStrategy.LRU);
    });
  });

  describe('immutability', () => {
    it('should not affect builder after build', () => {
      const builder = CacheConfigBuilder.create();
      const config1 = builder.withMaxSize(500).build();
      const config2 = builder.withMaxSize(1000).build();
      
      expect(config1.maxSize).toBe(500);
      expect(config2.maxSize).toBe(1000);
    });
  });
});
