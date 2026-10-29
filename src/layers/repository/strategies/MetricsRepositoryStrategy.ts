/**
 * Metrics Repository Strategy
 *
 * Decorator strategy that wraps a base repository strategy and collects
 * execution metrics for monitoring and observability.
 *
 * @module RepositoryLayer/Strategies
 */

import type { IRepositoryStrategy, RepositoryStrategyContext, RepositoryStrategyResult } from './IRepositoryStrategy';

/**
 * Metric data point for repository operations.
 */
export interface RepositoryMetric {
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
 * Aggregated metrics for a repository strategy.
 */
export interface RepositoryStrategyMetrics {
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
  /** Last execution timestamp */
  readonly lastExecutionTimestamp: number;
  /** Metrics by operation type */
  readonly byOperation: Record<string, Omit<RepositoryStrategyMetrics, 'byOperation' | 'byEntityType'>>;
  /** Metrics by entity type */
  readonly byEntityType: Record<string, Omit<RepositoryStrategyMetrics, 'byOperation' | 'byEntityType'>>;
}

/**
 * Metrics collector interface for repository strategies.
 */
export interface IRepositoryMetricsCollector {
  /** Records a metric data point */
  recordMetric(metric: RepositoryMetric): void;
  /** Records an execution for metrics collection */
  recordExecution(strategyName: string, context: RepositoryStrategyContext, durationMs: number, success: boolean): void;
  /** Gets aggregated metrics for a strategy */
  getMetrics(strategyName: string): RepositoryStrategyMetrics | null;
  /** Gets all metrics */
  getAllMetrics(): Record<string, RepositoryStrategyMetrics>;
  /** Resets metrics for a strategy */
  resetMetrics(strategyName: string): void;
  /** Resets all metrics */
  resetAllMetrics(): void;
}

/**
 * In-memory metrics collector implementation.
 */
export class InMemoryRepositoryMetricsCollector implements IRepositoryMetricsCollector {
  private readonly _metrics: Map<string, RepositoryMetric[]> = new Map();
  private readonly _executionTimes: Map<string, number[]> = new Map();
  private readonly _operationCounts: Map<string, Map<string, number>> = new Map();
  private readonly _entityTypeCounts: Map<string, Map<string, number>> = new Map();
  private readonly _startTimes: Map<string, number> = new Map();

  /** @inheritdoc */
  public recordMetric(metric: RepositoryMetric): void {
    const existing = this._metrics.get(metric.name) ?? [];
    existing.push(metric);
    this._metrics.set(metric.name, existing);
  }

  /** @inheritdoc */
  public getMetrics(strategyName: string): RepositoryStrategyMetrics | null {
    const executionTimes = this._executionTimes.get(strategyName);
    if (!executionTimes || executionTimes.length === 0) {
      return null;
    }

    const sortedTimes = [...executionTimes].sort((a, b) => a - b);
    const totalExecutions = sortedTimes.length;
    const successfulExecutions = this._getSuccessCount(strategyName);
    const failedExecutions = totalExecutions - successfulExecutions;

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

    const byOperation: Record<string, Omit<RepositoryStrategyMetrics, 'byOperation' | 'byEntityType'>> = {};
    const operationCounts = this._operationCounts.get(strategyName);
    if (operationCounts) {
      for (const [operation, count] of operationCounts.entries()) {
        const opTimes = this._getOperationTimes(strategyName, operation);
        if (opTimes.length > 0) {
          byOperation[operation] = this._computeMetrics(opTimes, count, strategyName, operation);
        }
      }
    }

    const byEntityType: Record<string, Omit<RepositoryStrategyMetrics, 'byOperation' | 'byEntityType'>> = {};
    const entityTypeCounts = this._entityTypeCounts.get(strategyName);
    if (entityTypeCounts) {
      for (const [entityType, count] of entityTypeCounts.entries()) {
        const etTimes = this._getEntityTypeTimes(strategyName, entityType);
        if (etTimes.length > 0) {
          byEntityType[entityType] = this._computeMetrics(etTimes, count, strategyName, entityType);
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
      lastExecutionTimestamp: sortedTimes[sortedTimes.length - 1] ?? Date.now(),
      byOperation,
      byEntityType,
    };
  }

  /** @inheritdoc */
  public getAllMetrics(): Record<string, RepositoryStrategyMetrics> {
    const result: Record<string, RepositoryStrategyMetrics> = {};
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
    this._entityTypeCounts.delete(strategyName);
    this._startTimes.delete(strategyName);
  }

  /** @inheritdoc */
  public resetAllMetrics(): void {
    this._metrics.clear();
    this._executionTimes.clear();
    this._operationCounts.clear();
    this._entityTypeCounts.clear();
    this._startTimes.clear();
  }

  /**
   * Records an execution for metrics collection.
   *
   * @param strategyName - Name of the strategy
   * @param context - Execution context
   * @param durationMs - Execution duration in milliseconds
   * @param success - Whether the execution succeeded
   */
  public recordExecution(
    strategyName: string,
    context: RepositoryStrategyContext,
    durationMs: number,
    success: boolean
  ): void {
    if (!this._executionTimes.has(strategyName)) {
      this._executionTimes.set(strategyName, []);
      this._operationCounts.set(strategyName, new Map());
      this._entityTypeCounts.set(strategyName, new Map());
      this._startTimes.set(strategyName, Date.now());
    }

    this._executionTimes.get(strategyName)!.push(durationMs);

    const opCounts = this._operationCounts.get(strategyName)!;
    opCounts.set(context.operation, (opCounts.get(context.operation) ?? 0) + 1);

    const etCounts = this._entityTypeCounts.get(strategyName)!;
    etCounts.set(context.entityType, (etCounts.get(context.entityType) ?? 0) + 1);

    this.recordMetric({
      name: `${strategyName}.execution.duration`,
      value: durationMs,
      unit: 'ms',
      tags: {
        strategy: strategyName,
        operation: context.operation,
        entityType: context.entityType,
        success: String(success),
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
        entityType: context.entityType,
        success: String(success),
      },
      timestamp: Date.now(),
    });
  }

  private _getSuccessCount(strategyName: string): number {
    const metrics = this._metrics.get(`${strategyName}.execution.count`) ?? [];
    return metrics.filter((m) => m.tags.success === 'true').length;
  }

  private _getOperationTimes(strategyName: string, operation: string): number[] {
    const metrics = this._metrics.get(`${strategyName}.execution.duration`) ?? [];
    return metrics.filter((m) => m.tags.operation === operation).map((m) => m.value);
  }

  private _getEntityTypeTimes(strategyName: string, entityType: string): number[] {
    const metrics = this._metrics.get(`${strategyName}.execution.duration`) ?? [];
    return metrics.filter((m) => m.tags.entityType === entityType).map((m) => m.value);
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
  ): Omit<RepositoryStrategyMetrics, 'byOperation' | 'byEntityType'> {
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
      lastExecutionTimestamp: sorted[sorted.length - 1],
    };
  }
}

/**
 * Metrics decorator strategy that wraps a base strategy and collects execution metrics.
 *
 * @typeParam T - The type of result data returned by the wrapped strategy
 */
export class MetricsRepositoryStrategy<T = unknown> implements IRepositoryStrategy<T> {
  /** @inheritdoc */
  public readonly name: string;

  /** @inheritdoc */
  public readonly priority: number;

  private readonly _wrappedStrategy: IRepositoryStrategy<T>;
  private readonly _metricsCollector: IRepositoryMetricsCollector;

  /**
   * Creates a new MetricsRepositoryStrategy.
   *
   * @param wrappedStrategy - The strategy to wrap with metrics collection
   * @param metricsCollector - Optional custom metrics collector (defaults to in-memory)
   */
  constructor(wrappedStrategy: IRepositoryStrategy<T>, metricsCollector?: IRepositoryMetricsCollector) {
    this._wrappedStrategy = wrappedStrategy;
    this._metricsCollector = metricsCollector ?? new InMemoryRepositoryMetricsCollector();
    this.name = `metrics-${wrappedStrategy.name}`;
    this.priority = wrappedStrategy.priority;
  }

  /**
   * @inheritdoc
   */
  public canHandle(context: RepositoryStrategyContext): boolean {
    return this._wrappedStrategy.canHandle(context);
  }

  /**
   * @inheritdoc
   */
  public async execute(context: RepositoryStrategyContext): Promise<RepositoryStrategyResult<T>> {
    const startTime = Date.now();

    try {
      const result = await this._wrappedStrategy.execute(context);
      const durationMs = Date.now() - startTime;

      this._metricsCollector.recordExecution(this._wrappedStrategy.name, context, durationMs, result.success);

      return {
        ...result,
        metadata: {
          strategyName: this.name,
          executionTimeMs: result.metadata?.executionTimeMs ?? 0,
          timestamp: result.metadata?.timestamp ?? Date.now(),
        },
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this._metricsCollector.recordExecution(this._wrappedStrategy.name, context, durationMs, false);
      throw error;
    }
  }

  /**
   * Gets the wrapped strategy instance.
   *
   * @returns The wrapped strategy
   */
  public getWrappedStrategy(): IRepositoryStrategy<T> {
    return this._wrappedStrategy;
  }

  /**
   * Gets the metrics collector instance.
   *
   * @returns The metrics collector
   */
  public getMetricsCollector(): IRepositoryMetricsCollector {
    return this._metricsCollector;
  }

  /**
   * Gets aggregated metrics for this strategy.
   *
   * @returns Aggregated metrics or null if no executions recorded
   */
  public getMetrics(): RepositoryStrategyMetrics | null {
    return this._metricsCollector.getMetrics(this._wrappedStrategy.name);
  }
}
