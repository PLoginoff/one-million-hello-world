/**
 * Metrics Cache Strategy
 *
 * Decorator strategy that wraps a base cache strategy and collects
 * execution metrics for monitoring and observability.
 *
 * @module CacheLayer/Strategies
 */

import type { ICacheStrategy, CacheStrategyContext, CacheStrategyResult } from './ICacheStrategy';

/**
 * Metric data point for cache operations.
 */
export interface CacheMetric {
  /** Name of the metric */
  readonly name: string;
  /** Metric value */
  readonly value: number;
  /** Metric unit */
  readonly unit: string;
  /** Tags for dimensional analysis */
  readonly tags: Record<string, string>;
  /** Timestamp when the metric was recorded */
  readonly timestamp: number;
}

/**
 * Aggregated metrics for a cache strategy.
 */
export interface CacheStrategyMetrics {
  /** Total number of executions */
  readonly totalExecutions: number;
  /** Number of successful executions */
  readonly successfulExecutions: number;
  /** Number of failed executions */
  readonly failedExecutions: number;
  /** Average execution time in milliseconds */
  readonly averageExecutionTimeMs: number;
  /** Minimum execution time in milliseconds */
  readonly minExecutionTimeMs: number;
  /** Maximum execution time in milliseconds */
  readonly maxExecutionTimeMs: number;
  /** Execution time percentiles */
  readonly percentiles: {
    readonly p50: number;
    readonly p90: number;
    readonly p95: number;
    readonly p99: number;
  };
  /** Error rate (0-1) */
  readonly errorRate: number;
  /** Throughput (executions per second) */
  readonly throughputPerSecond: number;
  /** Cache hit rate (0-1) */
  readonly hitRate: number;
  /** Last execution timestamp */
  readonly lastExecutionTimestamp: number;
  /** Metrics by operation type */
  readonly byOperation: Record<string, Omit<CacheStrategyMetrics, 'byOperation' | 'byLevel'>>;
  /** Metrics by cache level */
  readonly byLevel: Record<string, Omit<CacheStrategyMetrics, 'byOperation' | 'byLevel'>>;
}

/**
 * Metrics collector interface for cache strategies.
 */
export interface ICacheMetricsCollector {
  /** Records a metric data point */
  recordMetric(metric: CacheMetric): void;
  /** Records an execution for metrics collection */
  recordExecution(strategyName: string, context: CacheStrategyContext, durationMs: number, success: boolean, hit: boolean): void;
  /** Gets aggregated metrics for a strategy */
  getMetrics(strategyName: string): CacheStrategyMetrics | null;
  /** Gets all metrics */
  getAllMetrics(): Record<string, CacheStrategyMetrics>;
  /** Resets metrics for a strategy */
  resetMetrics(strategyName: string): void;
  /** Resets all metrics */
  resetAllMetrics(): void;
}

/**
 * In-memory metrics collector implementation.
 */
export class InMemoryCacheMetricsCollector implements ICacheMetricsCollector {
  private readonly _metrics: Map<string, CacheMetric[]> = new Map();
  private readonly _executionTimes: Map<string, number[]> = new Map();
  private readonly _operationCounts: Map<string, Map<string, number>> = new Map();
  private readonly _levelCounts: Map<string, Map<string, number>> = new Map();
  private readonly _hitCounts: Map<string, Map<string, number>> = new Map();
  private readonly _startTimes: Map<string, number> = new Map();

  /** @inheritdoc */
  public recordMetric(metric: CacheMetric): void {
    const existing = this._metrics.get(metric.name) ?? [];
    existing.push(metric);
    this._metrics.set(metric.name, existing);
  }

  /** @inheritdoc */
  public getMetrics(strategyName: string): CacheStrategyMetrics | null {
    const executionTimes = this._executionTimes.get(strategyName);
    if (!executionTimes || executionTimes.length === 0) {
      return null;
    }

    const sortedTimes = [...executionTimes].sort((a, b) => a - b);
    const totalExecutions = sortedTimes.length;
    const successfulExecutions = this._getSuccessCount(strategyName);
    const failedExecutions = totalExecutions - successfulExecutions;
    const hitCount = this._getHitCount(strategyName);

    const sum = sortedTimes.reduce((acc, val) => acc + val, 0);
    const averageExecutionTimeMs = sum / totalExecutions;
    const minExecutionTimeMs = sortedTimes[0];
    const maxExecutionTimeMs = sortedTimes[sortedTimes.length - 1];

    const percentiles = {
      p50: this._percentile(sortedTimes, 0.5),
      p90: this._percentile(sortedTimes, 0.9),
      p95: this._percentile(sortedTimes, 0.95),
      p99: this._percentile(sortedTimes, 0.99),
    };

    const timeRangeMs = Date.now() - (this._startTimes.get(strategyName) ?? Date.now());
    const throughputPerSecond = timeRangeMs > 0 ? (totalExecutions / timeRangeMs) * 1000 : 0;
    const hitRate = totalExecutions > 0 ? hitCount / totalExecutions : 0;

    const byOperation: Record<string, Omit<CacheStrategyMetrics, 'byOperation' | 'byLevel'>> = {};
    const operationCounts = this._operationCounts.get(strategyName);
    if (operationCounts) {
      for (const [operation, count] of operationCounts.entries()) {
        const opTimes = this._getOperationTimes(strategyName, operation);
        if (opTimes.length > 0) {
          byOperation[operation] = this._computeMetrics(opTimes, count, strategyName, operation);
        }
      }
    }

    const byLevel: Record<string, Omit<CacheStrategyMetrics, 'byOperation' | 'byLevel'>> = {};
    const levelCounts = this._levelCounts.get(strategyName);
    if (levelCounts) {
      for (const [level, count] of levelCounts.entries()) {
        const levelTimes = this._getLevelTimes(strategyName, level);
        if (levelTimes.length > 0) {
          byLevel[level] = this._computeMetrics(levelTimes, count, strategyName, level);
        }
      }
    }

    return {
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      averageExecutionTimeMs,
      minExecutionTimeMs,
      maxExecutionTimeMs,
      percentiles,
      errorRate: totalExecutions > 0 ? failedExecutions / totalExecutions : 0,
      throughputPerSecond,
      hitRate,
      lastExecutionTimestamp: sortedTimes[sortedTimes.length - 1] ?? Date.now(),
      byOperation,
      byLevel,
    };
  }

  /** @inheritdoc */
  public getAllMetrics(): Record<string, CacheStrategyMetrics> {
    const result: Record<string, CacheStrategyMetrics> = {};
    for (const strategyName of this._executionTimes.keys()) {
      const metrics = this.getMetrics(strategyName);
      if (metrics) {
        result[strategyName] = metrics;
      }
    }
    return result;
  }

  /** @inheritdoc */
  public resetMetrics(strategyName: string): void {
    this._executionTimes.delete(strategyName);
    this._operationCounts.delete(strategyName);
    this._levelCounts.delete(strategyName);
    this._hitCounts.delete(strategyName);
    this._startTimes.delete(strategyName);
  }

  /** @inheritdoc */
  public resetAllMetrics(): void {
    this._metrics.clear();
    this._executionTimes.clear();
    this._operationCounts.clear();
    this._levelCounts.clear();
    this._hitCounts.clear();
    this._startTimes.clear();
  }

  /**
   * Records an execution for metrics collection.
   *
   * @param strategyName - Name of the strategy
   * @param context - Execution context
   * @param durationMs - Execution duration in milliseconds
   * @param success - Whether the execution succeeded
   * @param hit - Whether it was a cache hit (for get operations)
   */
  public recordExecution(
    strategyName: string,
    context: CacheStrategyContext,
    durationMs: number,
    success: boolean,
    hit: boolean = false
  ): void {
    if (!this._executionTimes.has(strategyName)) {
      this._executionTimes.set(strategyName, []);
      this._operationCounts.set(strategyName, new Map());
      this._levelCounts.set(strategyName, new Map());
      this._hitCounts.set(strategyName, new Map());
      this._startTimes.set(strategyName, Date.now());
    }

    this._executionTimes.get(strategyName)!.push(durationMs);

    const opCounts = this._operationCounts.get(strategyName)!;
    opCounts.set(context.operation, (opCounts.get(context.operation) ?? 0) + 1);

    const levelCounts = this._levelCounts.get(strategyName)!;
    const level = context.level ?? 'unknown';
    levelCounts.set(level, (levelCounts.get(level) ?? 0) + 1);

    const hitCounts = this._hitCounts.get(strategyName)!;
    const hitKey = hit ? 'hit' : 'miss';
    hitCounts.set(hitKey, (hitCounts.get(hitKey) ?? 0) + 1);

    this.recordMetric({
      name: `${strategyName}.execution.duration`,
      value: durationMs,
      unit: 'ms',
      tags: {
        strategy: strategyName,
        operation: context.operation,
        level,
        success: String(success),
        hit: String(hit),
      },
      timestamp: Date.now(),
    });

    this.recordMetric({
      name: `${strategyName}.execution.count`,
      value: 1,
      unit: 'count',
      tags: {
        strategy: strategyName,
        operation: context.operation,
        level,
        success: String(success),
        hit: String(hit),
      },
      timestamp: Date.now(),
    });
  }

  private _getSuccessCount(strategyName: string): number {
    const metrics = this._metrics.get(`${strategyName}.execution.count`) ?? [];
    return metrics.filter((m) => m.tags.success === 'true').length;
  }

  private _getHitCount(strategyName: string): number {
    const metrics = this._metrics.get(`${strategyName}.execution.count`) ?? [];
    return metrics.filter((m) => m.tags.hit === 'true').length;
  }

  private _getOperationTimes(strategyName: string, operation: string): number[] {
    const metrics = this._metrics.get(`${strategyName}.execution.duration`) ?? [];
    return metrics.filter((m) => m.tags.operation === operation).map((m) => m.value);
  }

  private _getLevelTimes(strategyName: string, level: string): number[] {
    const metrics = this._metrics.get(`${strategyName}.execution.duration`) ?? [];
    return metrics.filter((m) => m.tags.level === level).map((m) => m.value);
  }

  private _percentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;
    const index = Math.ceil(percentile * sortedArray.length) - 1;
    return sortedArray[Math.max(0, index)];
  }

  private _computeMetrics(
    times: number[],
    count: number,
    _strategyName: string,
    _dimension: string
  ): Omit<CacheStrategyMetrics, 'byOperation' | 'byLevel'> {
    const sorted = [...times].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, val) => acc + val, 0);
    return {
      totalExecutions: count,
      successfulExecutions: count,
      failedExecutions: 0,
      averageExecutionTimeMs: sum / sorted.length,
      minExecutionTimeMs: sorted[0],
      maxExecutionTimeMs: sorted[sorted.length - 1],
      percentiles: {
        p50: this._percentile(sorted, 0.5),
        p90: this._percentile(sorted, 0.9),
        p95: this._percentile(sorted, 0.95),
        p99: this._percentile(sorted, 0.99),
      },
      errorRate: 0,
      throughputPerSecond: 0,
      hitRate: 0,
      lastExecutionTimestamp: sorted[sorted.length - 1],
    };
  }
}

/**
 * Metrics decorator strategy that wraps a base strategy and collects execution metrics.
 *
 * @typeParam T - The type of result data returned by the wrapped strategy
 */
export class MetricsCacheStrategy<T = unknown> implements ICacheStrategy<T> {
  /** @inheritdoc */
  public readonly name: string;

  /** @inheritdoc */
  public readonly priority: number;

  private readonly _wrappedStrategy: ICacheStrategy<T>;
  private readonly _metricsCollector: ICacheMetricsCollector;

  /**
   * Creates a new MetricsCacheStrategy.
   *
   * @param wrappedStrategy - The strategy to wrap with metrics collection
   * @param metricsCollector - Optional custom metrics collector (defaults to in-memory)
   */
  constructor(wrappedStrategy: ICacheStrategy<T>, metricsCollector?: ICacheMetricsCollector) {
    this._wrappedStrategy = wrappedStrategy;
    this._metricsCollector = metricsCollector ?? new InMemoryCacheMetricsCollector();
    this.name = `metrics-${wrappedStrategy.name}`;
    this.priority = wrappedStrategy.priority;
  }

  /**
   * @inheritdoc
   */
  public canHandle(context: CacheStrategyContext): boolean {
    return this._wrappedStrategy.canHandle(context);
  }

  /**
   * @inheritdoc
   */
  public async execute(context: CacheStrategyContext): Promise<CacheStrategyResult<T>> {
    const startTime = Date.now();

    try {
      const result = await this._wrappedStrategy.execute(context);
      const durationMs = Date.now() - startTime;
      const hit = result.metadata?.hit ?? false;

      this._metricsCollector.recordExecution(this._wrappedStrategy.name, context, durationMs, result.success, hit);

      return {
        ...result,
        metadata: {
          ...result.metadata,
          strategyName: this.name,
          executionTimeMs: result.metadata?.executionTimeMs ?? durationMs,
          timestamp: result.metadata?.timestamp ?? Date.now(),
        },
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this._metricsCollector.recordExecution(this._wrappedStrategy.name, context, durationMs, false, false);
      throw error;
    }
  }

  /**
   * Gets the wrapped strategy instance.
   *
   * @returns The wrapped strategy
   */
  public getWrappedStrategy(): ICacheStrategy<T> {
    return this._wrappedStrategy;
  }

  /**
   * Gets the metrics collector instance.
   *
   * @returns The metrics collector
   */
  public getMetricsCollector(): ICacheMetricsCollector {
    return this._metricsCollector;
  }

  /**
   * Gets aggregated metrics for this strategy.
   *
   * @returns Aggregated metrics or null if no executions recorded
   */
  public getMetrics(): CacheStrategyMetrics | null {
    return this._metricsCollector.getMetrics(this._wrappedStrategy.name);
  }
}
