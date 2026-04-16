/**
 * DetailedStatisticsCollector Unit Tests
 * 
 * Tests for DetailedStatisticsCollector using AAA pattern.
 */

import { DetailedStatisticsCollector } from '../collectors/DetailedStatisticsCollector';

describe('DetailedStatisticsCollector', () => {
  let collector: DetailedStatisticsCollector;

  beforeEach(() => {
    collector = new DetailedStatisticsCollector();
  });

  describe('recordHit', () => {
    it('should increment hit count and record time', () => {
      collector.recordHit();
      const stats = collector.getDetailedStats();
      
      expect(stats.hits).toBe(1);
      expect(stats.lastHitTime).toBeGreaterThan(0);
    });

    it('should update last hit time', () => {
      collector.recordHit();
      const firstTime = collector.getDetailedStats().lastHitTime;
      
      setTimeout(() => {
        collector.recordHit();
        const secondTime = collector.getDetailedStats().lastHitTime;
        expect(secondTime).toBeGreaterThan(firstTime);
      }, 10);
    });
  });

  describe('recordMiss', () => {
    it('should increment miss count and record time', () => {
      collector.recordMiss();
      const stats = collector.getDetailedStats();
      
      expect(stats.misses).toBe(1);
      expect(stats.lastMissTime).toBeGreaterThan(0);
    });

    it('should update last miss time', () => {
      collector.recordMiss();
      const firstTime = collector.getDetailedStats().lastMissTime;
      
      setTimeout(() => {
        collector.recordMiss();
        const secondTime = collector.getDetailedStats().lastMissTime;
        expect(secondTime).toBeGreaterThan(firstTime);
      }, 10);
    });
  });

  describe('recordEviction', () => {
    it('should increment eviction count and record time', () => {
      collector.recordEviction();
      const stats = collector.getDetailedStats();
      
      expect(stats.evictions).toBe(1);
      expect(stats.lastEvictionTime).toBeGreaterThan(0);
    });

    it('should update last eviction time', () => {
      collector.recordEviction();
      const firstTime = collector.getDetailedStats().lastEvictionTime;
      
      setTimeout(() => {
        collector.recordEviction();
        const secondTime = collector.getDetailedStats().lastEvictionTime;
        expect(secondTime).toBeGreaterThan(firstTime);
      }, 10);
    });
  });

  describe('recordSizeChange', () => {
    it('should update size and track peak', () => {
      collector.recordSizeChange(100);
      const stats = collector.getDetailedStats();
      
      expect(stats.size).toBe(100);
      expect(stats.peakSize).toBe(100);
    });

    it('should update peak size on increase', () => {
      collector.recordSizeChange(50);
      collector.recordSizeChange(100);
      collector.recordSizeChange(150);
      const stats = collector.getDetailedStats();
      
      expect(stats.size).toBe(150);
      expect(stats.peakSize).toBe(150);
    });

    it('should preserve peak size on decrease', () => {
      collector.recordSizeChange(150);
      collector.recordSizeChange(100);
      const stats = collector.getDetailedStats();
      
      expect(stats.size).toBe(100);
      expect(stats.peakSize).toBe(150);
    });
  });

  describe('getDetailedStats', () => {
    it('should return detailed statistics', () => {
      collector.recordHit();
      collector.recordMiss();
      collector.recordEviction();
      collector.recordSizeChange(50);
      
      const stats = collector.getDetailedStats();
      
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.evictions).toBe(1);
      expect(stats.size).toBe(50);
      expect(stats.lastHitTime).toBeGreaterThan(0);
      expect(stats.lastMissTime).toBeGreaterThan(0);
      expect(stats.lastEvictionTime).toBeGreaterThan(0);
    });

    it('should initialize with zero values', () => {
      const stats = collector.getDetailedStats();
      
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.evictions).toBe(0);
      expect(stats.size).toBe(0);
      expect(stats.lastHitTime).toBe(0);
      expect(stats.lastMissTime).toBe(0);
      expect(stats.lastEvictionTime).toBe(0);
      expect(stats.averageAccessTime).toBe(0);
      expect(stats.peakSize).toBe(0);
    });
  });

  describe('reset', () => {
    it('should reset all statistics including detailed', () => {
      collector.recordHit();
      collector.recordMiss();
      collector.recordEviction();
      collector.recordSizeChange(50);
      collector.reset();
      
      const stats = collector.getDetailedStats();
      
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.evictions).toBe(0);
      expect(stats.size).toBe(0);
      expect(stats.lastHitTime).toBe(0);
      expect(stats.lastMissTime).toBe(0);
      expect(stats.lastEvictionTime).toBe(0);
      expect(stats.averageAccessTime).toBe(0);
      expect(stats.peakSize).toBe(0);
    });
  });

  describe('calculateAverageAccessTime', () => {
    it('should calculate average access time', () => {
      collector.recordHit();
      collector.recordMiss();
      
      const stats = collector.getDetailedStats();
      expect(stats.averageAccessTime).toBeGreaterThan(0);
    });

    it('should handle no accesses', () => {
      const stats = collector.getDetailedStats();
      expect(stats.averageAccessTime).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle rapid operations', () => {
      for (let i = 0; i < 1000; i++) {
        collector.recordHit();
      }
      
      const stats = collector.getDetailedStats();
      expect(stats.hits).toBe(1000);
    });

    it('should handle size fluctuations', () => {
      for (let i = 0; i < 10; i++) {
        collector.recordSizeChange(i * 10);
      }
      
      const stats = collector.getDetailedStats();
      expect(stats.peakSize).toBe(90);
      expect(stats.size).toBe(90);
    });
  });
});
