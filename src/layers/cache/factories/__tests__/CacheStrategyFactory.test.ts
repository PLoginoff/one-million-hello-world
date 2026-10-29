/**
 * Cache Strategy Factory Tests
 */

import { CacheStrategyFactory, CacheStrategyType, StrategySelectionCriteria } from '../CacheStrategyFactory';
import { LRUCacheStrategy } from '../../strategies/cache/LRUCacheStrategy';
import { LFUCacheStrategy } from '../../strategies/cache/LFUCacheStrategy';
import { TTLCacheStrategy } from '../../strategies/cache/TTLCacheStrategy';
import { FIFOCacheStrategy } from '../../strategies/cache/FIFOCacheStrategy';
import { RandomCacheStrategy } from '../../strategies/cache/RandomCacheStrategy';
import { SegmentedCacheStrategy } from '../../strategies/cache/SegmentedCacheStrategy';
import type { ICacheStrategy } from '../../strategies/cache/ICacheStrategy';
import { CacheError, CacheErrorCode } from '../../errors';

describe('CacheStrategyFactory', () => {
  let factory: CacheStrategyFactory;

  beforeEach(() => {
    factory = new CacheStrategyFactory();
  });

  describe('built-in strategies', () => {
    it('should create LRU strategy', () => {
      const strategy = factory.create('lru');
      expect(strategy).toBeInstanceOf(LRUCacheStrategy);
      expect(strategy.name).toBe('LRU');
    });

    it('should create LFU strategy', () => {
      const strategy = factory.create('lfu');
      expect(strategy).toBeInstanceOf(LFUCacheStrategy);
      expect(strategy.name).toBe('LFU');
    });

    it('should create TTL strategy', () => {
      const strategy = factory.create('ttl');
      expect(strategy).toBeInstanceOf(TTLCacheStrategy);
      expect(strategy.name).toBe('TTL');
    });

    it('should create FIFO strategy', () => {
      const strategy = factory.create('fifo');
      expect(strategy).toBeInstanceOf(FIFOCacheStrategy);
      expect(strategy.name).toBe('FIFO');
    });

    it('should create Random strategy', () => {
      const strategy = factory.create('random');
      expect(strategy).toBeInstanceOf(RandomCacheStrategy);
      expect(strategy.name).toBe('Random');
    });

    it('should create Segmented strategy', () => {
      const strategy = factory.create('segmented');
      expect(strategy).toBeInstanceOf(SegmentedCacheStrategy);
      expect(strategy.name).toBe('Segmented');
    });
  });

  describe('createByType', () => {
    it('should create strategy with default config', () => {
      const strategy = factory.createByType('lru');
      expect(strategy).toBeInstanceOf(LRUCacheStrategy);
    });

    it('should create strategy with custom config', () => {
      const strategy = factory.createByType('lru', { maxSize: 5000, defaultTTL: 120000 });
      expect(strategy).toBeInstanceOf(LRUCacheStrategy);
    });
  });

  describe('createTwoTier', () => {
    it('should create two-tier strategy', () => {
      const l1 = new LRUCacheStrategy();
      const l2 = new LFUCacheStrategy();
      const twoTier = factory.createTwoTier(l1, l2);
      expect(twoTier.name).toBe('TwoTier');
    });
  });

  describe('createSegmented', () => {
    it('should create segmented strategy', async () => {
      const segmented = await factory.createSegmented(
        [
          { id: 'hot', strategy: 'LRU', maxSize: 100, defaultTTL: 300000 },
          { id: 'cold', strategy: 'TTL', maxSize: 900, defaultTTL: 60000 },
        ],
        'cold'
      );
      expect(segmented).toBeInstanceOf(SegmentedCacheStrategy);
      expect(segmented.name).toBe('Segmented');
    });
  });

  describe('recommend', () => {
    it('should recommend LRU for temporal access pattern', () => {
      const criteria: StrategySelectionCriteria = {
        accessPattern: 'temporal',
        expectedSize: 'medium',
        latencyRequirement: 'medium',
      };
      const recommendation = factory.recommend(criteria);
      expect(recommendation.strategy).toBe('lru');
      expect(recommendation.confidence).toBeGreaterThan(0.8);
    });

    it('should recommend LFU for frequency access pattern', () => {
      const criteria: StrategySelectionCriteria = {
        accessPattern: 'frequency',
        expectedSize: 'medium',
        latencyRequirement: 'medium',
      };
      const recommendation = factory.recommend(criteria);
      expect(recommendation.strategy).toBe('lfu');
      expect(recommendation.confidence).toBeGreaterThan(0.8);
    });

    it('should recommend Random for uniform access pattern', () => {
      const criteria: StrategySelectionCriteria = {
        accessPattern: 'uniform',
        expectedSize: 'medium',
        latencyRequirement: 'medium',
      };
      const recommendation = factory.recommend(criteria);
      expect(recommendation.strategy).toBe('random');
    });

    it('should recommend TwoTier for multi-level requirement', () => {
      const criteria: StrategySelectionCriteria = {
        accessPattern: 'mixed',
        expectedSize: 'large',
        latencyRequirement: 'low',
        multiLevel: true,
      };
      const recommendation = factory.recommend(criteria);
      expect(recommendation.strategy).toBe('two-tier');
      expect(recommendation.confidence).toBeGreaterThan(0.85);
    });

    it('should recommend Segmented for huge cache', () => {
      const criteria: StrategySelectionCriteria = {
        accessPattern: 'mixed',
        expectedSize: 'huge',
        latencyRequirement: 'medium',
      };
      const recommendation = factory.recommend(criteria);
      expect(recommendation.strategy).toBe('segmented');
    });

    it('should provide reasoning', () => {
      const criteria: StrategySelectionCriteria = {
        accessPattern: 'temporal',
        expectedSize: 'medium',
      };
      const recommendation = factory.recommend(criteria);
      expect(recommendation.reasoning.length).toBeGreaterThan(0);
    });

    it('should provide alternatives', () => {
      const criteria: StrategySelectionCriteria = {
        accessPattern: 'temporal',
        expectedSize: 'medium',
      };
      const recommendation = factory.recommend(criteria);
      expect(recommendation.alternatives.length).toBeGreaterThan(0);
    });
  });

  describe('createFromRecommendation', () => {
    it('should create strategy from recommendation', () => {
      const recommendation = factory.recommend({ accessPattern: 'temporal' });
      const strategy = factory.createFromRecommendation(recommendation);
      expect(strategy).toBeInstanceOf(LRUCacheStrategy);
    });
  });

  describe('createDefault', () => {
    it('should create default LRU strategy', () => {
      const strategy = factory.createDefault();
      expect(strategy).toBeInstanceOf(LRUCacheStrategy);
    });
  });

  describe('registerStrategy', () => {
    it('should register custom strategy', () => {
      class CustomStrategy implements ICacheStrategy<unknown> {
        readonly name = 'custom';
        readonly version = '1.0.0';
        async initialize() {}
        async get() { return { hit: false }; }
        async set() { return { success: true, key: '' }; }
        async delete() { return false; }
        async clear() {}
        getStats() { return { hits: 0, misses: 0, evictions: 0, size: 0, getHitRate: () => 0, getMissRate: () => 0, getTotalRequests: () => 0, withHit: () => ({}), withMiss: () => ({}), withEviction: () => ({}), withSize: () => ({}), reset: () => ({}), toJSON: () => ({}) }; }
        async has() { return false; }
        async keys() { return []; }
        async size() { return 0; }
        async maintenance() { return 0; }
        async shutdown() {}
      }

      factory.registerStrategy('custom', () => new CustomStrategy());
      const strategy = factory.create('custom');
      expect(strategy.name).toBe('custom');
    });
  });

  describe('unregisterStrategy', () => {
    it('should unregister strategy', () => {
      factory.unregisterStrategy('lru');
      expect(() => factory.create('lru')).toThrow();
    });
  });

  describe('getAvailableStrategies', () => {
    it('should return all available strategies', () => {
      const strategies = factory.getAvailableStrategies();
      expect(strategies).toContain('lru');
      expect(strategies).toContain('lfu');
      expect(strategies).toContain('ttl');
      expect(strategies).toContain('fifo');
      expect(strategies).toContain('random');
      expect(strategies).toContain('segmented');
    });
  });

  describe('createAll', () => {
    it('should create all strategies', () => {
      const strategies = factory.createAll();
      expect(strategies.length).toBeGreaterThanOrEqual(6);
    });
  });

  describe('createByPriority', () => {
    it('should sort by priority', () => {
      const strategies = factory.createByPriority();
      for (let i = 1; i < strategies.length; i++) {
        const priorityA = (strategies[i - 1] as any).priority ?? 0;
        const priorityB = (strategies[i] as any).priority ?? 0;
        expect(priorityA).toBeGreaterThanOrEqual(priorityB);
      }
    });
  });

  describe('getOrCreate', () => {
    it('should return same instance for same name', () => {
      const strategy1 = factory.getOrCreate('lru');
      const strategy2 = factory.getOrCreate('lru');
      expect(strategy1).toBe(strategy2);
    });
  });

  describe('clearCache', () => {
    it('should clear cached instances', () => {
      factory.getOrCreate('lru');
      factory.clearCache();
      // After clear, getOrCreate should create new instance
      const strategy = factory.getOrCreate('lru');
      expect(strategy).toBeInstanceOf(LRUCacheStrategy);
    });
  });

  describe('getStrategyMetadata', () => {
    it('should return metadata for known strategy', () => {
      const metadata = factory.getStrategyMetadata('lru');
      expect(metadata).not.toBeNull();
      expect(metadata!.name).toBe('LRU');
      expect(metadata!.version).toBe('1.0.0');
      expect(metadata!.description).toContain('Least Recently Used');
    });

    it('should return null for unknown strategy', () => {
      const metadata = factory.getStrategyMetadata('unknown');
      expect(metadata).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should throw for unknown strategy', () => {
      expect(() => factory.create('unknown')).toThrow(CacheError);
      expect(() => factory.create('unknown')).toThrow('Unknown cache strategy');
    });
  });
});