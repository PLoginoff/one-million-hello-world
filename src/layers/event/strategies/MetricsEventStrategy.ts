/**
 * Metrics Event Strategy
 *
 * Decorator strategy that wraps a base event strategy and collects
 * execution metrics for monitoring and observability.
 *
 * @module EventLayer/Strategies
 */

import type { IEventStrategy, EventStrategyContext, EventStrategyResult } from './IEventStrategy';

/**
 * Metric data point for event operations.
 */
export interface EventMetric {
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
 * Aggregated metrics for an event strategy.
 */
export interface EventStrategyMetrics {
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
  readonly byOperation: Record<string, Omit<EventStrategyMetrics, 'byOperation' | 'byEventName'>>;
  /** Metrics by event name */
  readonly byEventName: Record<string, Omit<EventStrategyMetrics, 'byOperation' | 'byEventName'>>;
}

/**
 * Metrics collector interface for event strategies.
 */
export interface IEventMetricsCollector {
  /** Records a metric data point */
  recordMetric(metric: EventMetric): void;
  /** Records an execution for metrics collection */
  recordExecution(strategyName: string, context: EventStrategyContext, durationMs: number, success: boolean): void;
  /** Gets aggregated metrics for a strategy */
  getMetrics(strategyName: string): EventStrategyMetrics | null;
  /** Gets all metrics */
  getAllMetrics(): Record<string, EventStrategyMetrics>;
  /** Resets metrics for a strategy */
  resetMetrics(strategyName: string): void;
  /** Resets all metrics */
  resetAllMetrics(): void;
}

/**
 * In-memory metrics collector implementation.
 */
export class InMemoryEventMetricsCollector implements IEventMetricsCollector {
  private readonly _metrics: Map<string, EventMetric[]> = new Map();
  private readonly _executionTimes: Map<string, number[]> = new Map();
  private readonly _operationCounts: Map<string, Map<string, number>> = new Map();
  private readonly _eventNameCounts: Map<string, Map<string, number>> = new Map();
  private readonly _startTimes: Map<string, number> = new Map();

  /** @inheritdoc */
  public recordMetric(metric: EventMetric): void {
    const existing = this._metrics.get(metric.name) ?? [];
    existing.push(metric);
    this._metrics.set(metric.name, existing);
  }

  /** @inheritdoc */
  public recordExecution(
    strategyName: string,
    context: EventStrategyContext,
    durationMs: number,
    success: boolean
  ): void {
    if (!this._executionTimes.has(strategyName)) {
      this._executionTimes.set(strategyName, []);
      this._operationCounts.set(strategyName, new Map());
      this._eventNameCounts.set(strategyName, new Map());
      this._startTimes.set(strategyName, Date.now());
    }

    this._executionTimes.get(strategyName)!.push(durationMs);

    const opCounts = this._operationCounts.get(strategyName)!;
    opCounts.set(context.operation, (opCounts.get(context.operation) ?? 0) + 1);

    const enCounts = this._eventNameCounts.get(strategyName)!;
    enCounts.set(context.eventName, (enCounts.get(context.eventName) ?? 0) + 1);

    this.recordMetric({
      name: `${strategyName}.execution.duration`,
      value: durationMs,
      unit: 'ms',
      tags: {
        strategy: strategyName,
        operation: context.operation,
        eventName: context.eventName,
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
        eventName: context.eventName,
        success: String(success),
      },
      timestamp: Date.now(),
    });
  }

  /** @inheritdoc */
  public getMetrics(strategyName: string): EventStrategyMetrics | null {
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

    const byOperation: Record<string, Omit<EventStrategyMetrics, 'byOperation' | 'byEventName'>> = {};
    const operationCounts = this._operationCounts.get(strategyName);
    if (operationCounts) {
      for (const [operation, count] of operationCounts.entries()) {
        const opTimes = this._getOperationTimes(strategyName, operation);
        if (opTimes.length > 0) {
          byOperation[operation] = this._computeMetrics(opTimes, count, strategyName, operation);
        }
      }
    }

    const byEventName: Record<string, Omit<EventStrategyMetrics, 'byOperation' | 'byEventName'>> = {};
    const eventNameCounts = this._eventNameCounts.get(strategyName);
    if (eventNameCounts) {
      for (const [eventName, count] of eventNameCounts.entries()) {
        const enTimes = this._getEventNameTimes(strategyName, eventName);
        if (enTimes.length > 0) {
          byEventName[eventName] = this._computeMetrics(enTimes, count, strategyName, eventName);
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
      byEventName,
    };
  }

  /** @inheritdoc */
  public getAllMetrics(): Record<string, EventStrategyMetrics> {
    const result: Record<string, EventStrategyMetrics> = {};
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
    this._eventNameCounts.delete(strategyName);
    this._startTimes.delete(strategyName);
  }

  /** @inheritdoc */
  public resetAllMetrics(): void {
    this._metrics.clear();
    this._executionTimes.clear();
    this._operationCounts.clear();
    this._eventNameCounts.clear();
    this._startTimes.clear();
  }

  private _getSuccessCount(strategyName: string): number {
    const metrics = this._metrics.get(`${strategyName}.execution.count`) ?? [];
    return metrics.filter((m) => m.tags.success === 'true').length;
  }

  private _getOperationTimes(strategyName: string, operation: string): number[] {
    const metrics = this._metrics.get(`${strategyName}.execution.duration`) ?? [];
    return metrics.filter((m) => m.tags.operation === operation).map((m) => m.value);
  }

  private _getEventNameTimes(strategyName: string, eventName: string): number[] {
    const metrics = this._metrics.get(`${strategyName}.execution.duration`) ?? [];
    return metrics.filter((m) => m.tags.eventName === eventName).map((m) => m.value);
  }

  private _percentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;
    const index = Math.ceil(percentile * sortedArray.length) - 1;
    return sortedArray[Math.max(0, index)];
  }

  private _computeMetrics(
    times: number[],
    count: number,
    strategyName: string,
    dimension: string
  ): Omit<EventStrategyMetrics, 'byOperation' | 'byEventName'> {
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
export class MetricsEventStrategy<T = unknown> implements IEventStrategy<T> {
  /** @inheritdoc */
  public readonly name: string;

  /** @inheritdoc */
  public readonly priority: number;

  private readonly _wrappedStrategy: IEventStrategy<T>;
  private readonly _metricsCollector: IEventMetricsCollector;

  /**
   * Creates a new MetricsEventStrategy.
   *
   * @param wrappedStrategy - The strategy to wrap with metrics collection
   * @param metricsCollector - Optional custom metrics collector (defaults to in-memory)
   */
  constructor(wrappedStrategy: IEventStrategy<T>, metricsCollector?: IEventMetricsCollector) {
    this._wrappedStrategy = wrappedStrategy;
    this._metricsCollector = metricsCollector ?? new InMemoryEventMetricsCollector();
    this.name = `metrics-${wrappedStrategy.name}`;
    this.priority = wrappedStrategy.priority;
  }

  /**
   * @inheritdoc
   */
  public canHandle(context: EventStrategyContext): boolean {
    return this._wrappedStrategy.canHandle(context);
  }

  /**
   * @inheritdoc
   */
  public async execute(context: EventStrategyContext): Promise<EventStrategyResult<T>> {
    const startTime = Date.now();

    try {
      const result = await this._wrappedStrategy.execute(context);
      const durationMs = Date.now() - startTime;

      this._metricsCollector.recordExecution(this._wrappedStrategy.name, context, durationMs, result.success);

      return {
        ...result,
        metadata: {
          ...result.metadata,
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
  public getWrappedStrategy(): IEventStrategy<T> {
    return this._wrappedStrategy;
  }

  /**
   * Gets the metrics collector instance.
   *
   * @returns The metrics collector
   */
  public getMetricsCollector(): IEventMetricsCollector {
    return this._metricsCollector;
  }

  /**
   * Gets aggregated metrics for this strategy.
   *
   * @returns Aggregated metrics or null if no executions recorded
   */
  public getMetrics(): EventStrategyMetrics | null {
    return this._metricsCollector.getMetrics(this._wrappedStrategy.name);
  }
}