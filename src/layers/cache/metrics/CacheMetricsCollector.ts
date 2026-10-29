/**
 * Cache Metrics Collector
 *
 * Collects and aggregates cache metrics including hit/miss rates,
 * latency percentiles, eviction counts, and throughput.
 *
 * @module CacheLayer/Metrics
 */

import { IStatisticsCollector } from '../statistics/collectors/IStatisticsCollector';
import { ICacheMetricsCollector, CacheMetric, CacheStrategyMetrics } from '../strategies/MetricsCacheStrategy';

export interface CacheMetrics {
  cacheHitsTotal: number;
  cacheMissesTotal: number;
  cacheHitRate: number;
  cacheMissRate: number;
  cacheEvictionsTotal: number;
  cacheSize: number;
  cacheTotalRequests: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p90LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  throughputPerSecond: number;
  collectedAt: number;
}

export interface CacheMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export interface CacheMetricsCollectorConfig {
  /** Collection interval in ms */
  collectionIntervalMs?: number;
  /** Maximum samples to keep per metric */
  maxSamplesPerMetric?: number;
  /** Enable percentile calculation */
  enablePercentiles?: boolean;
  /** Percentiles to calculate */
  percentiles?: number[];
}

/**
 * Cache Metrics Collector Implementation
 *
 * Provides comprehensive metrics collection for cache operations:
 * - Hit/miss counters and rates
 * - Latency percentiles (p50, p90, p95, p99)
 * - Eviction tracking
 * - Throughput measurement
 * - Per-operation and per-level breakdowns
 */
export class CacheMetricsCollector implements ICacheMetricsCollector {
  private readonly _collector: IStatisticsCollector;
  private readonly _config: Required<CacheMetricsCollectorConfig>;
  private _collectionCount: number = 0;
  private _startTime: number = Date.now();
  private _operationMetrics: Map<string, OperationMetrics> = new Map();
  private _levelMetrics: Map<string, LevelMetrics> = new Map();
  private _strategyMetrics: Map<string, StrategyMetrics> = new Map();
  private _collectionInterval: ReturnType<typeof setInterval> | null = null;

  constructor(collector: IStatisticsCollector, config: CacheMetricsCollectorConfig = {}) {
    this._collector = collector;
    this._config = {
      collectionIntervalMs: config.collectionIntervalMs ?? 60000,
      maxSamplesPerMetric: config.maxSamplesPerMetric ?? 1000,
      enablePercentiles: config.enablePercentiles ?? true,
      percentiles: config.percentiles ?? [0.5, 0.9, 0.95, 0.99],
    };

    // Start periodic collection
    this._startCollection();
  }

  /**
   * Record a metric data point
   */
  recordMetric(metric: CacheMetric): void {
    // Store in strategy metrics
    const strategyName = metric.tags.strategy || 'unknown';
    let strategyMetric = this._strategyMetrics.get(strategyName);
    if (!strategyMetric) {
      strategyMetric = new StrategyMetrics();
      this._strategyMetrics.set(strategyName, strategyMetric);
    }
    strategyMetric.recordMetric(metric);
  }

  /**
   * Record an execution for metrics collection
   */
  recordExecution(
    strategyName: string,
    context: { operation: string; level?: string },
    durationMs: number,
    success: boolean,
    hit: boolean = false
  ): void {
    const now = Date.now();

    // Update strategy metrics
    let strategyMetric = this._strategyMetrics.get(strategyName);
    if (!strategyMetric) {
      strategyMetric = new StrategyMetrics();
      this._strategyMetrics.set(strategyName, strategyMetric);
    }
    strategyMetric.recordExecution(context.operation, context.level || 'unknown', durationMs, success, hit, now);

    // Update operation metrics
    let opMetric = this._operationMetrics.get(context.operation);
    if (!opMetric) {
      opMetric = new OperationMetrics();
      this._operationMetrics.set(context.operation, opMetric);
    }
    opMetric.recordExecution(durationMs, success, hit, now);

    // Update level metrics
    const level = context.level || 'unknown';
    let levelMetric = this._levelMetrics.get(level);
    if (!levelMetric) {
      levelMetric = new LevelMetrics();
      this._levelMetrics.set(level, levelMetric);
    }
    levelMetric.recordExecution(durationMs, success, hit, now);
  }

  /**
   * Get aggregated metrics for a strategy
   */
  getMetrics(strategyName: string): CacheStrategyMetrics | null {
    const strategyMetric = this._strategyMetrics.get(strategyName);
    if (!strategyMetric || strategyMetric.totalExecutions === 0) {
      return null;
    }
    return strategyMetric.toCacheStrategyMetrics(this._config.percentiles);
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): Record<string, CacheStrategyMetrics> {
    const result: Record<string, CacheStrategyMetrics> = {};
    for (const [name, metric] of this._strategyMetrics.entries()) {
      if (metric.totalExecutions > 0) {
        result[name] = metric.toCacheStrategyMetrics(this._config.percentiles);
      }
    }
    return result;
  }

  /**
   * Get operation-level metrics
   */
  getOperationMetrics(operation: string): OperationMetricsSummary | null {
    const metric = this._operationMetrics.get(operation);
    if (!metric || metric.totalExecutions === 0) {
      return null;
    }
    return metric.toSummary(this._config.percentiles);
  }

  /**
   * Get level-level metrics
   */
  getLevelMetrics(level: string): LevelMetricsSummary | null {
    const metric = this._levelMetrics.get(level);
    if (!metric || metric.totalExecutions === 0) {
      return null;
    }
    return metric.toSummary(this._config.percentiles);
  }

  /**
   * Get combined cache metrics
   */
  collect(): CacheMetrics {
    const stats = this._collector.getStats();
    this._collectionCount++;

    // Calculate combined latency percentiles
    const allLatencies: number[] = [];
    for (const metric of this._strategyMetrics.values()) {
      allLatencies.push(...metric.executionTimes);
    }
    allLatencies.sort((a, b) => a - b);

    const percentiles = this._calculatePercentiles(allLatencies, this._config.percentiles);
    const avgLatency = allLatencies.length > 0
      ? allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length
      : 0;

    const timeRangeMs = Date.now() - this._startTime;
    const throughputPerSecond = timeRangeMs > 0
      ? (this._getTotalExecutions() / timeRangeMs) * 1000
      : 0;

    return {
      cacheHitsTotal: stats.hits,
      cacheMissesTotal: stats.misses,
      cacheHitRate: stats.getHitRate(),
      cacheMissRate: stats.getMissRate(),
      cacheEvictionsTotal: stats.evictions,
      cacheSize: stats.size,
      cacheTotalRequests: stats.getTotalRequests(),
      avgLatencyMs: avgLatency,
      p50LatencyMs: percentiles[0.5] ?? 0,
      p90LatencyMs: percentiles[0.9] ?? 0,
      p95LatencyMs: percentiles[0.95] ?? 0,
      p99LatencyMs: percentiles[0.99] ?? 0,
      throughputPerSecond,
      collectedAt: Date.now(),
    };
  }

  /**
   * Collect metrics as Prometheus samples
   */
  collectAsPrometheusSamples(): CacheMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    const samples: CacheMetricSample[] = [
      { name: 'cache_hits_total', value: m.cacheHitsTotal, labels: {}, timestamp: ts },
      { name: 'cache_misses_total', value: m.cacheMissesTotal, labels: {}, timestamp: ts },
      { name: 'cache_hit_rate', value: m.cacheHitRate, labels: {}, timestamp: ts },
      { name: 'cache_miss_rate', value: m.cacheMissRate, labels: {}, timestamp: ts },
      { name: 'cache_evictions_total', value: m.cacheEvictionsTotal, labels: {}, timestamp: ts },
      { name: 'cache_size', value: m.cacheSize, labels: {}, timestamp: ts },
      { name: 'cache_total_requests', value: m.cacheTotalRequests, labels: {}, timestamp: ts },
      { name: 'cache_avg_latency_ms', value: m.avgLatencyMs, labels: {}, timestamp: ts },
      { name: 'cache_p50_latency_ms', value: m.p50LatencyMs, labels: {}, timestamp: ts },
      { name: 'cache_p90_latency_ms', value: m.p90LatencyMs, labels: {}, timestamp: ts },
      { name: 'cache_p95_latency_ms', value: m.p95LatencyMs, labels: {}, timestamp: ts },
      { name: 'cache_p99_latency_ms', value: m.p99LatencyMs, labels: {}, timestamp: ts },
      { name: 'cache_throughput_per_second', value: m.throughputPerSecond, labels: {}, timestamp: ts },
    ];

    // Add per-strategy metrics
    for (const [strategyName, strategyMetric] of this._strategyMetrics.entries()) {
      if (strategyMetric.totalExecutions > 0) {
        const sm = strategyMetric.toCacheStrategyMetrics(this._config.percentiles);
        const strategyLabels = { strategy: strategyName };
        samples.push(
          { name: 'cache_strategy_executions_total', value: sm.totalExecutions, labels: strategyLabels, timestamp: ts },
          { name: 'cache_strategy_successful_total', value: sm.successfulExecutions, labels: strategyLabels, timestamp: ts },
          { name: 'cache_strategy_failed_total', value: sm.failedExecutions, labels: strategyLabels, timestamp: ts },
          { name: 'cache_strategy_avg_latency_ms', value: sm.averageExecutionTimeMs, labels: strategyLabels, timestamp: ts },
          { name: 'cache_strategy_hit_rate', value: sm.hitRate, labels: strategyLabels, timestamp: ts },
          { name: 'cache_strategy_error_rate', value: sm.errorRate, labels: strategyLabels, timestamp: ts },
        );
      }
    }

    // Add per-operation metrics
    for (const [operation, opMetric] of this._operationMetrics.entries()) {
      if (opMetric.totalExecutions > 0) {
        const om = opMetric.toSummary(this._config.percentiles);
        const opLabels = { operation };
        samples.push(
          { name: 'cache_operation_executions_total', value: om.totalExecutions, labels: opLabels, timestamp: ts },
          { name: 'cache_operation_avg_latency_ms', value: om.avgLatencyMs, labels: opLabels, timestamp: ts },
          { name: 'cache_operation_hit_rate', value: om.hitRate, labels: opLabels, timestamp: ts },
        );
      }
    }

    // Add per-level metrics
    for (const [level, levelMetric] of this._levelMetrics.entries()) {
      if (levelMetric.totalExecutions > 0) {
        const lm = levelMetric.toSummary(this._config.percentiles);
        const levelLabels = { level };
        samples.push(
          { name: 'cache_level_executions_total', value: lm.totalExecutions, labels: levelLabels, timestamp: ts },
          { name: 'cache_level_avg_latency_ms', value: lm.avgLatencyMs, labels: levelLabels, timestamp: ts },
          { name: 'cache_level_hit_rate', value: lm.hitRate, labels: levelLabels, timestamp: ts },
        );
      }
    }

    return samples;
  }

  /**
   * Export metrics in Prometheus format
   */
  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP cache_hits_total Total cache hits',
      '# TYPE cache_hits_total counter',
      '# HELP cache_misses_total Total cache misses',
      '# TYPE cache_misses_total counter',
      '# HELP cache_hit_rate Cache hit rate (0-1)',
      '# TYPE cache_hit_rate gauge',
      '# HELP cache_miss_rate Cache miss rate (0-1)',
      '# TYPE cache_miss_rate gauge',
      '# HELP cache_evictions_total Total cache evictions',
      '# TYPE cache_evictions_total counter',
      '# HELP cache_size Current cache size',
      '# TYPE cache_size gauge',
      '# HELP cache_total_requests Total cache requests',
      '# TYPE cache_total_requests counter',
      '# HELP cache_avg_latency_ms Average cache latency in ms',
      '# TYPE cache_avg_latency_ms gauge',
      '# HELP cache_p50_latency_ms P50 cache latency in ms',
      '# TYPE cache_p50_latency_ms gauge',
      '# HELP cache_p90_latency_ms P90 cache latency in ms',
      '# TYPE cache_p90_latency_ms gauge',
      '# HELP cache_p95_latency_ms P95 cache latency in ms',
      '# TYPE cache_p95_latency_ms gauge',
      '# HELP cache_p99_latency_ms P99 cache latency in ms',
      '# TYPE cache_p99_latency_ms gauge',
      '# HELP cache_throughput_per_second Cache throughput (ops/sec)',
      '# TYPE cache_throughput_per_second gauge',
      '# HELP cache_strategy_executions_total Total executions per strategy',
      '# TYPE cache_strategy_executions_total counter',
      '# HELP cache_strategy_avg_latency_ms Average latency per strategy',
      '# TYPE cache_strategy_avg_latency_ms gauge',
      '# HELP cache_strategy_hit_rate Hit rate per strategy',
      '# TYPE cache_strategy_hit_rate gauge',
      '# HELP cache_strategy_error_rate Error rate per strategy',
      '# TYPE cache_strategy_error_rate gauge',
      '# HELP cache_operation_executions_total Total executions per operation',
      '# TYPE cache_operation_executions_total counter',
      '# HELP cache_operation_avg_latency_ms Average latency per operation',
      '# TYPE cache_operation_avg_latency_ms gauge',
      '# HELP cache_operation_hit_rate Hit rate per operation',
      '# TYPE cache_operation_hit_rate gauge',
      '# HELP cache_level_executions_total Total executions per cache level',
      '# TYPE cache_level_executions_total counter',
      '# HELP cache_level_avg_latency_ms Average latency per cache level',
      '# TYPE cache_level_avg_latency_ms gauge',
      '# HELP cache_level_hit_rate Hit rate per cache level',
      '# TYPE cache_level_hit_rate gauge',
    ];

    for (const s of samples) {
      const labels = Object.entries(s.labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(',');
      const labelStr = labels ? `{${labels}}` : '';
      lines.push(`${s.name}${labelStr} ${s.value} ${s.timestamp}`);
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Reset metrics for a strategy
   */
  resetMetrics(strategyName: string): void {
    this._strategyMetrics.delete(strategyName);
  }

  /**
   * Reset all metrics
   */
  resetAllMetrics(): void {
    this._strategyMetrics.clear();
    this._operationMetrics.clear();
    this._levelMetrics.clear();
    this._startTime = Date.now();
  }

  /**
   * Get collection count
   */
  getCollectionCount(): number {
    return this._collectionCount;
  }

  /**
   * Get uptime in milliseconds
   */
  getUptimeMs(): number {
    return Date.now() - this._startTime;
  }

  /**
   * Shutdown the collector
   */
  shutdown(): void {
    if (this._collectionInterval) {
      clearInterval(this._collectionInterval);
      this._collectionInterval = null;
    }
  }

  // Private methods

  private _startCollection(): void {
    this._collectionInterval = setInterval(() => {
      this.collect(); // Trigger collection to update internal state
    }, this._config.collectionIntervalMs);
  }

  private _getTotalExecutions(): number {
    let total = 0;
    for (const metric of this._strategyMetrics.values()) {
      total += metric.totalExecutions;
    }
    return total;
  }

  private _calculatePercentiles(sortedArray: number[], percentiles: number[]): Record<number, number> {
    const result: Record<number, number> = {};
    if (sortedArray.length === 0) {
      for (const p of percentiles) {
        result[p] = 0;
      }
      return result;
    }

    for (const p of percentiles) {
      const index = Math.ceil(p * sortedArray.length) - 1;
      result[p] = sortedArray[Math.max(0, index)];
    }
    return result;
  }
}

/**
 * Internal metrics for a strategy
 */
class StrategyMetrics {
  totalExecutions = 0;
  successfulExecutions = 0;
  failedExecutions = 0;
  hitCount = 0;
  executionTimes: number[] = [];
  operationCounts: Map<string, number> = new Map();
  levelCounts: Map<string, number> = new Map();
  hitCounts: Map<string, number> = new Map(); // 'hit' or 'miss'
  startTime = Date.now();

  recordMetric(metric: CacheMetric): void {
    // Could store raw metrics if needed
  }

  recordExecution(operation: string, level: string, durationMs: number, success: boolean, hit: boolean, timestamp: number): void {
    this.totalExecutions++;
    if (success) this.successfulExecutions++;
    else this.failedExecutions++;
    if (hit) this.hitCount++;
    this.executionTimes.push(durationMs);

    this.operationCounts.set(operation, (this.operationCounts.get(operation) ?? 0) + 1);
    this.levelCounts.set(level, (this.levelCounts.get(level) ?? 0) + 1);
    this.hitCounts.set(hit ? 'hit' : 'miss', (this.hitCounts.get(hit ? 'hit' : 'miss') ?? 0) + 1);

    // Trim old execution times if too many
    if (this.executionTimes.length > 10000) {
      this.executionTimes = this.executionTimes.slice(-5000);
    }
  }

  toCacheStrategyMetrics(percentiles: number[]): CacheStrategyMetrics {
    const sortedTimes = [...this.executionTimes].sort((a, b) => a - b);
    const totalExecutions = this.totalExecutions;
    const successfulExecutions = this.successfulExecutions;
    const failedExecutions = this.failedExecutions;
    const hitRate = totalExecutions > 0 ? this.hitCount / totalExecutions : 0;

    const sum = sortedTimes.reduce((a, b) => a + b, 0);
    const averageExecutionTimeMs = totalExecutions > 0 ? sum / totalExecutions : 0;
    const minExecutionTimeMs = sortedTimes[0] ?? 0;
    const maxExecutionTimeMs = sortedTimes[sortedTimes.length - 1] ?? 0;

    const percentileValues: Record<string, number> = {};
    for (const p of percentiles) {
      const index = Math.ceil(p * sortedTimes.length) - 1;
      percentileValues[`p${Math.round(p * 100)}`] = sortedTimes[Math.max(0, index)] ?? 0;
    }

    const timeRangeMs = Date.now() - this.startTime;
    const throughputPerSecond = timeRangeMs > 0 ? (totalExecutions / timeRangeMs) * 1000 : 0;

    const byOperation: Record<string, Omit<CacheStrategyMetrics, 'byOperation' | 'byLevel'>> = {};
    // Simplified - would need per-operation tracking for full detail

    const byLevel: Record<string, Omit<CacheStrategyMetrics, 'byOperation' | 'byLevel'>> = {};

    return {
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      averageExecutionTimeMs,
      minExecutionTimeMs,
      maxExecutionTimeMs,
      percentiles: {
        p50: percentileValues.p50 ?? 0,
        p90: percentileValues.p90 ?? 0,
        p95: percentileValues.p95 ?? 0,
        p99: percentileValues.p99 ?? 0,
      },
      errorRate: totalExecutions > 0 ? failedExecutions / totalExecutions : 0,
      throughputPerSecond,
      hitRate,
      lastExecutionTimestamp: sortedTimes[sortedTimes.length - 1] ?? Date.now(),
      byOperation,
      byLevel,
    };
  }
}

/**
 * Internal metrics for an operation
 */
class OperationMetrics {
  totalExecutions = 0;
  successfulExecutions = 0;
  hitCount = 0;
  executionTimes: number[] = [];

  recordExecution(durationMs: number, success: boolean, hit: boolean, timestamp: number): void {
    this.totalExecutions++;
    if (success) this.successfulExecutions++;
    if (hit) this.hitCount++;
    this.executionTimes.push(durationMs);

    if (this.executionTimes.length > 10000) {
      this.executionTimes = this.executionTimes.slice(-5000);
    }
  }

  toSummary(percentiles: number[]): OperationMetricsSummary {
    const sortedTimes = [...this.executionTimes].sort((a, b) => a - b);
    const sum = sortedTimes.reduce((a, b) => a + b, 0);
    const avgLatencyMs = this.totalExecutions > 0 ? sum / this.totalExecutions : 0;

    const percentileValues: Record<string, number> = {};
    for (const p of percentiles) {
      const index = Math.ceil(p * sortedTimes.length) - 1;
      percentileValues[`p${Math.round(p * 100)}`] = sortedTimes[Math.max(0, index)] ?? 0;
    }

    return {
      totalExecutions: this.totalExecutions,
      successfulExecutions: this.successfulExecutions,
      hitRate: this.totalExecutions > 0 ? this.hitCount / this.totalExecutions : 0,
      avgLatencyMs,
      p50LatencyMs: percentileValues.p50 ?? 0,
      p90LatencyMs: percentileValues.p90 ?? 0,
      p95LatencyMs: percentileValues.p95 ?? 0,
      p99LatencyMs: percentileValues.p99 ?? 0,
    };
  }
}

export interface OperationMetricsSummary {
  totalExecutions: number;
  successfulExecutions: number;
  hitRate: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p90LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
}

/**
 * Internal metrics for a cache level
 */
class LevelMetrics {
  totalExecutions = 0;
  successfulExecutions = 0;
  hitCount = 0;
  executionTimes: number[] = [];

  recordExecution(durationMs: number, success: boolean, hit: boolean, timestamp: number): void {
    this.totalExecutions++;
    if (success) this.successfulExecutions++;
    if (hit) this.hitCount++;
    this.executionTimes.push(durationMs);

    if (this.executionTimes.length > 10000) {
      this.executionTimes = this.executionTimes.slice(-5000);
    }
  }

  toSummary(percentiles: number[]): LevelMetricsSummary {
    const sortedTimes = [...this.executionTimes].sort((a, b) => a - b);
    const sum = sortedTimes.reduce((a, b) => a + b, 0);
    const avgLatencyMs = this.totalExecutions > 0 ? sum / this.totalExecutions : 0;

    const percentileValues: Record<string, number> = {};
    for (const p of percentiles) {
      const index = Math.ceil(p * sortedTimes.length) - 1;
      percentileValues[`p${Math.round(p * 100)}`] = sortedTimes[Math.max(0, index)] ?? 0;
    }

    return {
      totalExecutions: this.totalExecutions,
      successfulExecutions: this.successfulExecutions,
      hitRate: this.totalExecutions > 0 ? this.hitCount / this.totalExecutions : 0,
      avgLatencyMs,
      p50LatencyMs: percentileValues.p50 ?? 0,
      p90LatencyMs: percentileValues.p90 ?? 0,
      p95LatencyMs: percentileValues.p95 ?? 0,
      p99LatencyMs: percentileValues.p99 ?? 0,
    };
  }
}

export interface LevelMetricsSummary {
  totalExecutions: number;
  successfulExecutions: number;
  hitRate: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p90LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
}