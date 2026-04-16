/**
 * BasicStatisticsCollector Unit Tests
 * 
 * Tests for BasicStatisticsCollector using AAA pattern.
 */

import { BasicStatisticsCollector } from '../collectors/BasicStatisticsCollector';

describe('BasicStatisticsCollector', () => {
  let collector: BasicStatisticsCollector;

  beforeEach(() => {
    collector = new BasicStatisticsCollector();
  });

  describe('recordHit', () => {
    it('should increment hit count', () => {
      collector.recordHit();
      const stats = collector.getStats();
      
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(0);
    });

    it('should increment hit count multiple times', () => {
      collector.recordHit();
      collector.recordHit();
      collector.recordHit();
      const stats = collector.getStats();
      
      expect(stats.hits).toBe(3);
    });
  });

  describe('recordMiss', () => {
    it('should increment miss count', () => {
      collector.recordMiss();
      const stats = collector.getStats();
      
      expect(stats.misses).toBe(1);
      expect(stats.hits).toBe(0);
    });

    it('should increment miss count multiple times', () => {
      collector.recordMiss();
      collector.recordMiss();
      const stats = collector.getStats();
      
      expect(stats.misses).toBe(2);
    });
  });

  describe('recordEviction', () => {
    it('should increment eviction count', () => {
      collector.recordEviction();
      const stats = collector.getStats();
      
      expect(stats.evictions).toBe(1);
    });

    it('should increment eviction count multiple times', () => {
      collector.recordEviction();
      collector.recordEviction();
      collector.recordEviction();
      const stats = collector.getStats();
      
      expect(stats.evictions).toBe(3);
    });
  });

  describe('recordSizeChange', () => {
    it('should update size', () => {
      collector.recordSizeChange(100);
      const stats = collector.getStats();
      
      expect(stats.size).toBe(100);
    });

    it('should handle size increase', () => {
      collector.recordSizeChange(50);
      collector.recordSizeChange(100);
      const stats = collector.getStats();
      
      expect(stats.size).toBe(100);
    });

    it('should handle size decrease', () => {
      collector.recordSizeChange(100);
      collector.recordSizeChange(50);
      const stats = collector.getStats();
      
      expect(stats.size).toBe(50);
    });

    it('should handle zero size', () => {
      collector.recordSizeChange(0);
      const stats = collector.getStats();
      
      expect(stats.size).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return current statistics', () => {
      collector.recordHit();
      collector.recordMiss();
      collector.recordEviction();
      collector.recordSizeChange(50);
      
      const stats = collector.getStats();
      
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.evictions).toBe(1);
      expect(stats.size).toBe(50);
    });

    it('should return zero for new collector', () => {
      const stats = collector.getStats();
      
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.evictions).toBe(0);
      expect(stats.size).toBe(0);
    });
  });

  describe('reset', () => {
    it('should reset all statistics', () => {
      collector.recordHit();
      collector.recordMiss();
      collector.recordEviction();
      collector.recordSizeChange(50);
      collector.reset();
      
      const stats = collector.getStats();
      
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.evictions).toBe(0);
      expect(stats.size).toBe(0);
    });
  });

  describe('getHitRate', () => {
    it('should calculate hit rate correctly', () => {
      collector.recordHit();
      collector.recordHit();
      collector.recordHit();
      collector.recordMiss();
      collector.recordMiss();
      
      const hitRate = collector.getHitRate();
      expect(hitRate).toBe(0.6);
    });

    it('should return 0 when no hits', () => {
      collector.recordMiss();
      collector.recordMiss();
      
      const hitRate = collector.getHitRate();
      expect(hitRate).toBe(0);
    });

    it('should return 1 when no misses', () => {
      collector.recordHit();
      collector.recordHit();
      
      const hitRate = collector.getHitRate();
      expect(hitRate).toBe(1);
    });

    it('should return 0 when no requests', () => {
      const hitRate = collector.getHitRate();
      expect(hitRate).toBe(0);
    });
  });

  describe('getMissRate', () => {
    it('should calculate miss rate correctly', () => {
      collector.recordHit();
      collector.recordHit();
      collector.recordMiss();
      collector.recordMiss();
      collector.recordMiss();
      
      const missRate = collector.getMissRate();
      expect(missRate).toBe(0.6);
    });

    it('should return 0 when no misses', () => {
      collector.recordHit();
      collector.recordHit();
      
      const missRate = collector.getMissRate();
      expect(missRate).toBe(0);
    });

    it('should return 1 when no hits', () => {
      collector.recordMiss();
      collector.recordMiss();
      
      const missRate = collector.getMissRate();
      expect(missRate).toBe(1);
    });
  });

  describe('getTotalRequests', () => {
    it('should calculate total requests', () => {
      collector.recordHit();
      collector.recordHit();
      collector.recordMiss();
      
      const total = collector.getTotalRequests();
      expect(total).toBe(3);
    });

    it('should return 0 when no requests', () => {
      const total = collector.getTotalRequests();
      expect(total).toBe(0);
    });
  });
});
