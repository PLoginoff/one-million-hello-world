/**
 * Cache Health Check Tests
 */

import { CacheHealthCheck } from '../health/CacheHealthCheck';
import { BasicStatisticsCollector } from '../statistics/collectors/BasicStatisticsCollector';

describe('CacheHealthCheck', () => {
  let collector: BasicStatisticsCollector;
  let healthCheck: CacheHealthCheck;

  beforeEach(() => {
    collector = new BasicStatisticsCollector();
    healthCheck = new CacheHealthCheck(collector);
  });

  describe('quickCheck', () => {
    it('should return degraded when no requests', () => {
      const result = healthCheck.quickCheck();
      expect(result.status).toBe('degraded');
      expect(result.checks.some(c => c.name === 'request-count')).toBe(true);
    });

    it('should return healthy when requests exist and hit rate good', () => {
      collector.recordHit();
      collector.recordHit();
      collector.recordHit();
      collector.recordMiss();

      const result = healthCheck.quickCheck();
      expect(result.status).toBe('healthy');
    });

    it('should return degraded when hit rate low', () => {
      collector.recordHit();
      collector.recordMiss();
      collector.recordMiss();
      collector.recordMiss();

      const result = healthCheck.quickCheck();
      expect(result.status).toBe('degraded');
    });

    it('should return unhealthy when hit rate very low', () => {
      collector.recordHit();
      for (let i = 0; i < 20; i++) {
        collector.recordMiss();
      }

      const result = healthCheck.quickCheck();
      expect(result.status).toBe('unhealthy');
    });
  });

  describe('check', () => {
    it('should perform all core checks', async () => {
      collector.recordHit();
      collector.recordHit();
      collector.recordMiss();

      const result = await healthCheck.check();
      expect(result.checks.length).toBeGreaterThanOrEqual(3);
      expect(result.checks.some(c => c.name === 'request-count')).toBe(true);
      expect(result.checks.some(c => c.name === 'hit-rate')).toBe(true);
      expect(result.checks.some(c => c.name === 'eviction-rate')).toBe(true);
      expect(result.checks.some(c => c.name === 'latency')).toBe(true);
    });

    it('should include metadata', async () => {
      collector.recordHit();
      const result = await healthCheck.check();
      expect(result.metadata).toBeDefined();
      expect(result.metadata!.checkCount).toBeGreaterThan(0);
    });
  });

  describe('configuration', () => {
    it('should use custom thresholds', () => {
      const customHealthCheck = new CacheHealthCheck(collector, {
        config: {
          minHitRate: 0.9,
          degradedHitRate: 0.7,
        },
      });

      collector.recordHit();
      collector.recordHit();
      collector.recordHit();
      collector.recordHit();
      collector.recordHit();
      collector.recordHit();
      collector.recordHit();
      collector.recordHit();
      collector.recordMiss();
      collector.recordMiss();

      const result = customHealthCheck.quickCheck();
      expect(result.status).toBe('degraded');
    });

    it('should update config', () => {
      healthCheck.updateConfig({ minHitRate: 0.95 });
      const config = healthCheck.getConfig();
      expect(config.minHitRate).toBe(0.95);
    });
  });
});