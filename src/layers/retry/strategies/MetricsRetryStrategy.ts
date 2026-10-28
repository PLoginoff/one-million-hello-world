/**
 * Metrics Retry Strategy
 *
 * Decorator that wraps a retry strategy and collects metrics
 * for all execution attempts, retries, delays, and results.
 *
 * @module RetryLayer/Strategies
 */

import { IRetryStrategy, RetryContext, RetryStrategyResult } from './IRetryStrategy';
import { RetryConfig, RetryStrategy as RetryStrategyType } from '../types/retry-types';

/**
 * Metrics data point
 */
export interface MetricDataPoint {
  /** Timestamp of the metric */
  timestamp: number;
  /** Metric name */
  name: string;
  /** Metric value */
  value: number;
  /** Metric tags/labels */
  tags: Record<string, string>;
}

/**
 * Aggregated metrics snapshot
 */
export interface MetricsSnapshot {
  /** Total executions */
  totalExecutions: number;
  /** Successful executions */
  successfulExecutions: number;
  /** Failed executions */
  failedExecutions: number;
  /** Total attempts across all executions */
  totalAttempts: number;
  /** Average attempts per execution */
  avgAttemptsPerExecution: number;
  /** Average execution duration in ms */
  avgDurationMs: number;
  /** Retry strategy distribution */
  strategyDistribution: Record<RetryStrategyType, number>;
  /** Histogram of execution durations (ms) */
  durationHistogram: number[];
  /** Histogram of attempts per execution */
  attemptsHistogram: number[];
  /** Histogram of delays (ms) */
  delayHistogram: number[];
}

/**
 * Metrics collector interface
 */
export interface IMetricsCollector {
  /** Records a metric data point */
  record(metric: MetricDataPoint): void;
  /** Gets current metrics snapshot */
  getSnapshot(): MetricsSnapshot;
  /** Resets all metrics */
  reset(): void;
}

/**
 * In-memory metrics collector implementation
 */
export class InMemoryMetricsCollector implements IMetricsCollector {
  private readonly _metrics: MetricDataPoint[] = [];
  private readonly _maxMetrics: number;
  private _snapshot: MetricsSnapshot;

  constructor(maxMetrics: number = 10000) {
    this._maxMetrics = maxMetrics;
    this._snapshot = this.createEmptySnapshot();
  }

  private createEmptySnapshot(): MetricsSnapshot {
    return {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      totalAttempts: 0,
      avgAttemptsPerExecution: 0,
      avgDurationMs: 0,
      strategyDistribution: {
        [RetryStrategyType.EXPONENTIAL_BACKOFF]: 0,
        [RetryStrategyType.FIXED_DELAY]: 0,
        [RetryStrategyType.LINEAR_BACKOFF]: 0,
      },
      durationHistogram: [],
      attemptsHistogram: [],
      delayHistogram: [],
    };
  }

  record(metric: MetricDataPoint): void {
    this._metrics.push(metric);

    // Trim if exceeding max
    if (this._metrics.length > this._maxMetrics) {
      this._metrics.shift();
    }

    // Update snapshot based on metric
    this.updateSnapshot(metric);
  }

  private updateSnapshot(metric: MetricDataPoint): void {
    switch (metric.name) {
      case 'execution.start':
        this._snapshot.totalExecutions++;
        const strategy = metric.tags.strategy as RetryStrategyType;
        if (strategy in this._snapshot.strategyDistribution) {
          this._snapshot.strategyDistribution[strategy]++;
        }
        break;
      case 'execution.success':
        this._snapshot.successfulExecutions++;
        this._snapshot.totalAttempts += metric.value;
        this.updateDurationHistogram(Number(metric.tags.durationMs) || 0);
        this.updateAttemptsHistogram(metric.value);
        break;
      case 'execution.failure':
        this._snapshot.failedExecutions++;
        this._snapshot.totalAttempts += metric.value;
        this.updateDurationHistogram(Number(metric.tags.durationMs) || 0);
        this.updateAttemptsHistogram(metric.value);
        break;
      case 'retry.delay':
        this.updateDelayHistogram(metric.value);
        break;
      case 'retry.attempt':
        // Track individual retry attempts
        break;
    }

    // Recalculate averages
    if (this._snapshot.totalExecutions > 0) {
      this._snapshot.avgAttemptsPerExecution = this._snapshot.totalAttempts / this._snapshot.totalExecutions;
    }
    if (this._snapshot.durationHistogram.length > 0) {
      const sum = this._snapshot.durationHistogram.reduce((a, b) => a + b, 0);
      this._snapshot.avgDurationMs = sum / this._snapshot.durationHistogram.length;
    }
  }

  private updateDurationHistogram(durationMs: number): void {
    this._snapshot.durationHistogram.push(durationMs);
    if (this._snapshot.durationHistogram.length > 1000) {
      this._snapshot.durationHistogram.shift();
    }
  }

  private updateAttemptsHistogram(attempts: number): void {
    this._snapshot.attemptsHistogram.push(attempts);
    if (this._snapshot.attemptsHistogram.length > 1000) {
      this._snapshot.attemptsHistogram.shift();
    }
  }

  private updateDelayHistogram(delayMs: number): void {
    this._snapshot.delayHistogram.push(delayMs);
    if (this._snapshot.delayHistogram.length > 1000) {
      this._snapshot.delayHistogram.shift();
    }
  }

  getSnapshot(): MetricsSnapshot {
    return { ...this._snapshot };
  }

  reset(): void {
    this._metrics.length = 0;
    this._snapshot = this.createEmptySnapshot();
  }

  /**
   * Gets all recorded metrics
   *
   * @returns Array of all metric data points
   */
  getAllMetrics(): MetricDataPoint[] {
    return [...this._metrics];
  }
}

/**
 * Metrics decorator for retry strategies
 *
 * Wraps a base strategy and collects metrics for all operations.
 *
 * @typeParam T - The type of result returned by the operation
 */
export class MetricsRetryStrategy<T = unknown> implements IRetryStrategy<T> {
  readonly name: string;
  readonly priority: number;

  private readonly _wrapped: IRetryStrategy<T>;
  private readonly _collector: IMetricsCollector;

  /**
   * Creates a new MetricsRetryStrategy
   *
   * @param wrapped - The base strategy to wrap
   * @param collector - Optional custom metrics collector (defaults to InMemoryMetricsCollector)
   */
  constructor(wrapped: IRetryStrategy<T>, collector?: IMetricsCollector) {
    this._wrapped = wrapped;
    this._collector = collector ?? new InMemoryMetricsCollector();
    this.name = `metrics-${wrapped.name}`;
    this.priority = wrapped.priority;
  }

  /**
   * Executes an operation with retry logic and metrics collection
   *
   * @param context - Execution context
   * @returns Strategy execution result
   */
  async execute(context: RetryContext<T>): Promise<RetryStrategyResult<T>> {
    const startTime = Date.now();
    const operationName = context.operation.name ?? 'anonymous';

    // Record execution start
    this._collector.record({
      timestamp: startTime,
      name: 'execution.start',
      value: 1,
      tags: {
        strategy: this._wrapped.name,
        operation: operationName,
        retryStrategy: context.config.strategy,
        maxAttempts: String(context.config.maxAttempts),
        idempotent: String(context.idempotent),
      },
    });

    try {
      const result = await this._wrapped.execute(context);
      const durationMs = Date.now() - startTime;

      if (result.success) {
        this._collector.record({
          timestamp: Date.now(),
          name: 'execution.success',
          value: result.attempts,
          tags: {
            strategy: this._wrapped.name,
            operation: operationName,
            attempts: String(result.attempts),
            durationMs: String(durationMs),
            delaysMs: result.delaysMs.join(','),
          },
        });
      } else {
        this._collector.record({
          timestamp: Date.now(),
          name: 'execution.failure',
          value: result.attempts,
          tags: {
            strategy: this._wrapped.name,
            operation: operationName,
            attempts: String(result.attempts),
            durationMs: String(durationMs),
            delaysMs: result.delaysMs.join(','),
            error: result.error ?? 'unknown',
          },
        });
      }

      // Record individual delays
      for (const delay of result.delaysMs) {
        this._collector.record({
          timestamp: Date.now(),
          name: 'retry.delay',
          value: delay,
          tags: {
            strategy: this._wrapped.name,
            operation: operationName,
          },
        });
      }

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;

      this._collector.record({
        timestamp: Date.now(),
        name: 'execution.failure',
        value: 0,
        tags: {
          strategy: this._wrapped.name,
          operation: operationName,
          durationMs: String(durationMs),
          error: error instanceof Error ? error.message : String(error),
        },
      });

      throw error;
    }
  }

  /**
   * Determines if this strategy can handle the given context
   *
   * @param context - Execution context to evaluate
   * @returns True if strategy can handle the context
   */
  canHandle(context: RetryContext<unknown>): boolean {
    return this._wrapped.canHandle(context);
  }

  /**
   * Calculates the delay before the next retry attempt
   *
   * @param attempt - Current attempt number (1-based)
   * @param config - Retry configuration
   * @param previousError - Previous error if any
   * @returns Delay in milliseconds
   */
  calculateDelay(attempt: number, config: RetryConfig, previousError?: Error): number {
    return this._wrapped.calculateDelay(attempt, config, previousError);
  }

  /**
   * Gets the metrics collector
   *
   * @returns The metrics collector instance
   */
  getCollector(): IMetricsCollector {
    return this._collector;
  }

  /**
   * Gets the current metrics snapshot
   *
   * @returns Current metrics snapshot
   */
  getSnapshot(): MetricsSnapshot {
    return this._collector.getSnapshot();
  }

  /**
   * Resets all collected metrics
   */
  resetMetrics(): void {
    this._collector.reset();
  }

  /**
   * Gets the wrapped strategy
   *
   * @returns The wrapped strategy instance
   */
  getWrappedStrategy(): IRetryStrategy<T> {
    return this._wrapped;
  }
}
