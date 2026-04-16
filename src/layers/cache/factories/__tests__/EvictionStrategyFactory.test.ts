/**
 * EvictionStrategyFactory Unit Tests
 * 
 * Tests for EvictionStrategyFactory using AAA pattern.
 */

import { EvictionStrategyFactory } from '../strategies/EvictionStrategyFactory';
import { InvalidationStrategy } from '../../types/cache-types';

describe('EvictionStrategyFactory', () => {
  describe('create', () => {
    it('should create LRU strategy', () => {
      const strategy = EvictionStrategyFactory.create(InvalidationStrategy.LRU);
      expect(strategy).toBeDefined();
    });

    it('should create LFU strategy', () => {
      const strategy = EvictionStrategyFactory.create(InvalidationStrategy.LFU);
      expect(strategy).toBeDefined();
    });

    it('should create FIFO strategy', () => {
      const strategy = EvictionStrategyFactory.create(InvalidationStrategy.FIFO);
      expect(strategy).toBeDefined();
    });

    it('should create RANDOM strategy', () => {
      const strategy = EvictionStrategyFactory.create(InvalidationStrategy.RANDOM);
      expect(strategy).toBeDefined();
    });

    it('should create TIME_BASED strategy', () => {
      const strategy = EvictionStrategyFactory.create(InvalidationStrategy.TIME_BASED);
      expect(strategy).toBeDefined();
    });

    it('should create MANUAL strategy', () => {
      const strategy = EvictionStrategyFactory.create(InvalidationStrategy.MANUAL);
      expect(strategy).toBeDefined();
    });

    it('should throw error for invalid strategy', () => {
      expect(() => {
        EvictionStrategyFactory.create('INVALID' as any);
      }).toThrow();
    });
  });

  describe('getAvailableStrategies', () => {
    it('should return list of available strategies', () => {
      const strategies = EvictionStrategyFactory.getAvailableStrategies();
      expect(strategies).toContain(InvalidationStrategy.LRU);
      expect(strategies).toContain(InvalidationStrategy.LFU);
      expect(strategies).toContain(InvalidationStrategy.FIFO);
      expect(strategies).toContain(InvalidationStrategy.RANDOM);
    });
  });

  describe('isValidStrategy', () => {
    it('should return true for valid strategies', () => {
      expect(EvictionStrategyFactory.isValidStrategy(InvalidationStrategy.LRU)).toBe(true);
      expect(EvictionStrategyFactory.isValidStrategy(InvalidationStrategy.LFU)).toBe(true);
    });

    it('should return false for invalid strategy', () => {
      expect(EvictionStrategyFactory.isValidStrategy('INVALID' as any)).toBe(false);
    });
  });
});
