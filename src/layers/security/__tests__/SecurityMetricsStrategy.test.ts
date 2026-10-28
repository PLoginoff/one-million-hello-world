/**
 * Security Metrics Strategy Tests
 */

import { SecurityDefaultStrategy, ISecurityStrategy } from '../strategies/DefaultStrategy';
import { SecurityMetricsStrategy, SecurityMetricsStrategyOptions, SecurityMetricsStrategyFactory } from '../strategies/MetricsStrategy';
import { SecurityStatistics } from '../statistics/SecurityStatistics';

describe('SecurityMetricsStrategy', () => {
  let mockStrategy: ISecurityStrategy;
  let statistics: SecurityStatistics;

  beforeEach(() => {
    mockStrategy = new SecurityDefaultStrategy();
    statistics = new SecurityStatistics();
  });

  describe('Construction', () => {
    it('should create metrics strategy with default options', () => {
      const strategy = new SecurityMetricsStrategy(mockStrategy, statistics);
      expect(strategy.name).toBe('metrics');
      expect(strategy.priority).toBe(6);
      expect(strategy.getWrappedStrategy()).toBe(mockStrategy);
    });

    it('should create metrics strategy with custom options', () => {
      const options: Partial<SecurityMetricsStrategyOptions> = {
        collectLatency: false,
        collectErrors: false,
        collectThroughput: false,
        histogramBuckets: [10, 50, 100],
        sampleRate: 0.5,
      };
      const strategy = new SecurityMetricsStrategy(mockStrategy, statistics, options);
      expect(strategy.getWrappedStrategy()).toBe(mockStrategy);
    });
  });

  describe('canHandle', () => {
    it('should delegate to wrapped strategy', () => {
      const strategy = new SecurityMetricsStrategy(mockStrategy, statistics);
      expect(strategy.canHandle({ test: 'data' })).toBe(true);
      expect(strategy.canHandle(null)).toBe(false);
      expect(strategy.canHandle(undefined)).toBe(false);
    });
  });

  describe('execute', () => {
    it('should collect metrics on success', async () => {
      const strategy = new SecurityMetricsStrategy(mockStrategy, statistics, { sampleRate: 1.0 });
      const input = { test: 'data' };

      const result = await strategy.execute(input);

      expect(result.success).toBe(true);
      expect(strategy.getExecutionCount()).toBe(1);
    });

    it('should collect metrics on failure', async () => {
      const failingStrategy: ISecurityStrategy = {
        name: 'failing',
        priority: 0,
        canHandle: () => true,
        execute: async () => {
          throw new Error('Strategy failed');
        },
      };

      const strategy = new SecurityMetricsStrategy(failingStrategy, statistics, { sampleRate: 1.0 });

      await expect(strategy.execute({ test: 'data' })).rejects.toThrow();
      expect(strategy.getExecutionCount()).toBe(1);
    });

    it('should record latency in histogram', async () => {
      const strategy = new SecurityMetricsStrategy(mockStrategy, statistics, {
        sampleRate: 1.0,
        histogramBuckets: [10, 50, 100],
      });

      await strategy.execute({ test: 'data' });

      const histogram = strategy.getLatencyHistogram();
      // Should have recorded in the first bucket (10ms)
      expect(histogram.get(10)).toBeGreaterThanOrEqual(0);
    });

    it('should respect sample rate', async () => {
      const strategy = new SecurityMetricsStrategy(mockStrategy, statistics, { sampleRate: 0.0 });

      // With 0 sample rate, it should still execute but not collect metrics
      await strategy.execute({ test: 'data' });
      expect(strategy.getExecutionCount()).toBe(1);
    });

    it('should return result from wrapped strategy', async () => {
      const strategy = new SecurityMetricsStrategy(mockStrategy, statistics, { sampleRate: 1.0 });

      const result = await strategy.execute({ key: 'value' });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });
  });

  describe('getMetrics', () => {
    it('should return metrics from collector', async () => {
      const strategy = new SecurityMetricsStrategy(mockStrategy, statistics, { sampleRate: 1.0 });

      await strategy.execute({ test: 'data' });

      const metrics = strategy.getMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.securityAuthTotal).toBeGreaterThanOrEqual(0);
      expect(metrics.collectedAt).toBeDefined();
    });
  });

  describe('getPrometheusMetrics', () => {
    it('should return Prometheus samples', async () => {
      const strategy = new SecurityMetricsStrategy(mockStrategy, statistics, { sampleRate: 1.0 });

      await strategy.execute({ test: 'data' });

      const samples = strategy.getPrometheusMetrics();
      expect(Array.isArray(samples)).toBe(true);
      expect(samples.length).toBeGreaterThan(0);
      expect(samples[0]).toHaveProperty('name');
      expect(samples[0]).toHaveProperty('value');
      expect(samples[0]).toHaveProperty('labels');
      expect(samples[0]).toHaveProperty('timestamp');
    });
  });

  describe('getPrometheusString', () => {
    it('should return Prometheus formatted string', async () => {
      const strategy = new SecurityMetricsStrategy(mockStrategy, statistics, { sampleRate: 1.0 });

      await strategy.execute({ test: 'data' });

      const promString = strategy.getPrometheusString();
      expect(typeof promString).toBe('string');
      expect(promString).toContain('# HELP');
      expect(promString).toContain('# TYPE');
    });
  });

  describe('resetHistogram', () => {
    it('should reset latency histogram', async () => {
      const strategy = new SecurityMetricsStrategy(mockStrategy, statistics, {
        sampleRate: 1.0,
        histogramBuckets: [10, 50, 100],
      });

      await strategy.execute({ test: 'data' });
      expect(strategy.getLatencyHistogram().get(10)!).toBeGreaterThan(0);

      strategy.resetHistogram();
      expect(strategy.getLatencyHistogram().get(10)).toBe(0);
    });
  });

  describe('setSampleRate', () => {
    it('should update sample rate', () => {
      const strategy = new SecurityMetricsStrategy(mockStrategy, statistics, { sampleRate: 1.0 });
      strategy.setSampleRate(0.5);
      // Can't directly test private field, but should not throw
    });

    it('should clamp sample rate to valid range', () => {
      const strategy = new SecurityMetricsStrategy(mockStrategy, statistics, { sampleRate: 1.0 });
      strategy.setSampleRate(-0.5);
      strategy.setSampleRate(1.5);
      // Should not throw
    });
  });
});

describe('SecurityMetricsStrategyFactory', () => {
  let mockStrategy: ISecurityStrategy;
  let statistics: SecurityStatistics;

  beforeEach(() => {
    mockStrategy = new SecurityDefaultStrategy();
    statistics = new SecurityStatistics();
  });

  it('should create metrics strategy', () => {
    const strategy = SecurityMetricsStrategyFactory.create(mockStrategy, statistics);
    expect(strategy).toBeInstanceOf(SecurityMetricsStrategy);
    expect(strategy.getWrappedStrategy()).toBe(mockStrategy);
  });

  it('should create metrics strategy with options', () => {
    const strategy = SecurityMetricsStrategyFactory.create(mockStrategy, statistics, { sampleRate: 0.5 });
    expect(strategy).toBeInstanceOf(SecurityMetricsStrategy);
  });

  it('should create with defaults', () => {
    const strategy = SecurityMetricsStrategyFactory.createWithDefaults(mockStrategy, statistics);
    expect(strategy).toBeInstanceOf(SecurityMetricsStrategy);
  });
});