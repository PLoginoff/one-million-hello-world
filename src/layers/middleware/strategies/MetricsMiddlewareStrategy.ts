/**
 * Metrics Middleware Strategy
 *
 * Decorator that wraps a middleware strategy and collects metrics
 * for all middleware pipeline operations.
 *
 * @module MiddlewareLayer/Strategies
 */

import { IMiddlewareStrategy, MiddlewareStrategyContext, MiddlewareStrategyResult } from './IMiddlewareStrategy';

/**
 * Metric data point for middleware operations.
 */
export interface MiddlewareMetric {
  /** Name of the metric */
  readonly name: string;
  /** Type of metric */
  readonly type: 'counter' | 'gauge' | 'histogram';
  /** Metric value */
  readonly value: number;
  /** Labels for dimensionality */
  readonly labels: Record<string, string>;
  /** Timestamp when metric was recorded */
  readonly timestamp: number;
}

/**
 * Aggregated metrics for a middleware strategy.
 */
export interface MiddlewareMetricsSnapshot {
  /** Total number of middleware executions */
  readonly totalExecutions: number;
  /** Number of successful executions */
  readonly successfulExecutions: number;
  /** Number of failed executions */
  readonly failedExecutions: number;
  /** Number of execution errors (exceptions) */
  readonly errorExecutions: number;
  /** Average execution time in milliseconds */
  readonly avgExecutionTimeMs: number;
  /** Minimum execution time in milliseconds */
  readonly minExecutionTimeMs: number;
  /** Maximum execution time in milliseconds */
  readonly maxExecutionTimeMs: number;
  /** 50th percentile execution time */
  readonly p50ExecutionTimeMs: number;
  /** 95th percentile execution time */
  readonly p95ExecutionTimeMs: number;
  /** 99th percentile execution time */
  readonly p99ExecutionTimeMs: number;
  /** Stages executed per request (average) */
  readonly avgStagesExecuted: number;
  /** Stages skipped per request (average) */
  readonly avgStagesSkipped: number;
  /** Errors by error code */
  readonly errorsByCode: Record<string, number>;
  /** Executions by HTTP method */
  readonly executionsByMethod: Record<string, number>;
  /** Executions by strategy (for decorated strategies) */
  readonly executionsByStrategy: Record<string, number>;
  /** Executions by stage type */
  readonly executionsByStageType: Record<string, number>;
  /** Timestamp of snapshot */
  readonly timestamp: number;
}

/**
 * Metrics collector interface.
 */
export interface IMiddlewareMetricsCollector {
  /** Record a metric */
  record(metric: MiddlewareMetric): void;
  /** Get current metrics snapshot */
  getSnapshot(): MiddlewareMetricsSnapshot;
  /** Reset all metrics */
  reset(): void;
}

/**
 * In-memory metrics collector implementation.
 */
export class InMemoryMiddlewareMetricsCollector implements IMiddlewareMetricsCollector {
  private readonly metrics: MiddlewareMetric[] = [];
  private readonly maxMetrics: number;

  private totalExecutions = 0;
  private successfulExecutions = 0;
  private failedExecutions = 0;
  private errorExecutions = 0;
  private executionTimes: number[] = [];
  private stagesExecuted: number[] = [];
  private stagesSkipped: number[] = [];
  private errorsByCode: Record<string, number> = {};
  private executionsByMethod: Record<string, number> = {};
  private executionsByStrategy: Record<string, number> = {};
  private executionsByStageType: Record<string, number> = {};

  constructor(maxMetrics: number = 10000) {
    this.maxMetrics = maxMetrics;
  }

  record(metric: MiddlewareMetric): void {
    this.metrics.push(metric);

    // Trim if exceeding max
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }

    // Update aggregates
    switch (metric.name) {
      case 'middleware.execution.total':
        this.totalExecutions++;
        break;
      case 'middleware.execution.success':
        this.successfulExecutions++;
        break;
      case 'middleware.execution.failed':
        this.failedExecutions++;
        break;
      case 'middleware.execution.error':
        this.errorExecutions++;
        break;
      case 'middleware.execution_time':
        this.executionTimes.push(metric.value);
        if (this.executionTimes.length > this.maxMetrics) {
          this.executionTimes.shift();
        }
        break;
      case 'middleware.stages_executed':
        this.stagesExecuted.push(metric.value);
        if (this.stagesExecuted.length > this.maxMetrics) {
          this.stagesExecuted.shift();
        }
        break;
      case 'middleware.stages_skipped':
        this.stagesSkipped.push(metric.value);
        if (this.stagesSkipped.length > this.maxMetrics) {
          this.stagesSkipped.shift();
        }
        break;
      case 'middleware.error':
        this.errorsByCode[metric.labels.code] = (this.errorsByCode[metric.labels.code] ?? 0) + 1;
        break;
      case 'middleware.execution.by_method':
        this.executionsByMethod[metric.labels.method] = (this.executionsByMethod[metric.labels.method] ?? 0) + 1;
        break;
      case 'middleware.execution.by_strategy':
        this.executionsByStrategy[metric.labels.strategy] =
          (this.executionsByStrategy[metric.labels.strategy] ?? 0) + 1;
        break;
      case 'middleware.execution.by_stage_type':
        this.executionsByStageType[metric.labels.stageType] =
          (this.executionsByStageType[metric.labels.stageType] ?? 0) + 1;
        break;
    }
  }

  getSnapshot(): MiddlewareMetricsSnapshot {
    const sortedTimes = [...this.executionTimes].sort((a, b) => a - b);
    const sortedStagesExecuted = [...this.stagesExecuted].sort((a, b) => a - b);
    const sortedStagesSkipped = [...this.stagesSkipped].sort((a, b) => a - b);

    const percentile = (arr: number[], p: number): number => {
      if (arr.length === 0) return 0;
      const index = Math.ceil(arr.length * p) - 1;
      return arr[Math.max(0, index)];
    };

    const sum = (arr: number[]): number => arr.reduce((a, b) => a + b, 0);
    const avg = (arr: number[]): number => (arr.length > 0 ? sum(arr) / arr.length : 0);

    return {
      totalExecutions: this.totalExecutions,
      successfulExecutions: this.successfulExecutions,
      failedExecutions: this.failedExecutions,
      errorExecutions: this.errorExecutions,
      avgExecutionTimeMs: avg(this.executionTimes),
      minExecutionTimeMs: sortedTimes[0] ?? 0,
      maxExecutionTimeMs: sortedTimes[sortedTimes.length - 1] ?? 0,
      p50ExecutionTimeMs: percentile(sortedTimes, 0.5),
      p95ExecutionTimeMs: percentile(sortedTimes, 0.95),
      p99ExecutionTimeMs: percentile(sortedTimes, 0.99),
      avgStagesExecuted: avg(this.stagesExecuted),
      avgStagesSkipped: avg(this.stagesSkipped),
      errorsByCode: { ...this.errorsByCode },
      executionsByMethod: { ...this.executionsByMethod },
      executionsByStrategy: { ...this.executionsByStrategy },
      executionsByStageType: { ...this.executionsByStageType },
      timestamp: Date.now(),
    };
  }

  reset(): void {
    this.metrics.length = 0;
    this.totalExecutions = 0;
    this.successfulExecutions = 0;
    this.failedExecutions = 0;
    this.errorExecutions = 0;
    this.executionTimes = [];
    this.stagesExecuted = [];
    this.stagesSkipped = [];
    this.errorsByCode = {};
    this.executionsByMethod = {};
    this.executionsByStrategy = {};
    this.executionsByStageType = {};
  }

  /**
   * Get all recorded metrics (for debugging/export).
   *
   * @returns Copy of all metrics
   */
  getAllMetrics(): MiddlewareMetric[] {
    return [...this.metrics];
  }
}

/**
 * Metrics middleware strategy decorator.
 *
 * Wraps an existing middleware strategy and collects metrics
 * for all pipeline operations without modifying the core logic.
 */
export class MetricsMiddlewareStrategy implements IMiddlewareStrategy {
  readonly name: string;
  readonly priority: number;

  private readonly wrappedStrategy: IMiddlewareStrategy;
  private readonly collector: IMiddlewareMetricsCollector;
  private readonly strategyLabel: string;

  /**
   * Create a new MetricsMiddlewareStrategy.
   *
   * @param wrappedStrategy - The strategy to wrap with metrics
   * @param collector - Optional custom metrics collector (defaults to in-memory)
   * @param strategyLabel - Optional label for this strategy in metrics (defaults to wrapped strategy name)
   */
  constructor(wrappedStrategy: IMiddlewareStrategy, collector?: IMiddlewareMetricsCollector, strategyLabel?: string) {
    this.wrappedStrategy = wrappedStrategy;
    this.collector = collector ?? new InMemoryMiddlewareMetricsCollector();
    this.strategyLabel = strategyLabel ?? wrappedStrategy.name;
    this.name = `metrics-${wrappedStrategy.name}`;
    this.priority = wrappedStrategy.priority;
  }

  /**
   * Check if the wrapped strategy can handle the context.
   *
   * @param context - The middleware context to evaluate
   * @returns True if the wrapped strategy can handle the context
   */
  canHandle(context: MiddlewareStrategyContext): boolean {
    return this.wrappedStrategy.canHandle(context);
  }

  /**
   * Execute the wrapped strategy with metrics collection.
   *
   * @param context - The middleware context
   * @returns Promise resolving to the middleware result
   */
  async execute(context: MiddlewareStrategyContext): Promise<MiddlewareStrategyResult> {
    const startTime = Date.now();
    const method = context.method.toUpperCase();

    // Record total execution
    this.collector.record({
      name: 'middleware.execution.total',
      type: 'counter',
      value: 1,
      labels: { method, strategy: this.strategyLabel },
      timestamp: startTime,
    });

    // Record by method
    this.collector.record({
      name: 'middleware.execution.by_method',
      type: 'counter',
      value: 1,
      labels: { method, strategy: this.strategyLabel },
      timestamp: startTime,
    });

    // Record by strategy
    this.collector.record({
      name: 'middleware.execution.by_strategy',
      type: 'counter',
      value: 1,
      labels: { method, strategy: this.strategyLabel },
      timestamp: startTime,
    });

    try {
      const result = await this.wrappedStrategy.execute(context);
      const executionTimeMs = Date.now() - startTime;

      // Record execution time
      this.collector.record({
        name: 'middleware.execution_time',
        type: 'histogram',
        value: executionTimeMs,
        labels: { method, strategy: this.strategyLabel, success: String(result.success) },
        timestamp: Date.now(),
      });

      // Record stages executed/skipped
      if (result.metadata?.stagesExecuted !== undefined) {
        this.collector.record({
          name: 'middleware.stages_executed',
          type: 'histogram',
          value: result.metadata.stagesExecuted,
          labels: { method, strategy: this.strategyLabel },
          timestamp: Date.now(),
        });
      }

      if (result.metadata?.stagesSkipped !== undefined) {
        this.collector.record({
          name: 'middleware.stages_skipped',
          type: 'histogram',
          value: result.metadata.stagesSkipped,
          labels: { method, strategy: this.strategyLabel },
          timestamp: Date.now(),
        });
      }

      if (result.success) {
        this.collector.record({
          name: 'middleware.execution.success',
          type: 'counter',
          value: 1,
          labels: { method, strategy: this.strategyLabel },
          timestamp: Date.now(),
        });
      } else {
        this.collector.record({
          name: 'middleware.execution.failed',
          type: 'counter',
          value: 1,
          labels: { method, strategy: this.strategyLabel, errorCode: result.error?.code ?? 'UNKNOWN' },
          timestamp: Date.now(),
        });

        if (result.error?.code) {
          this.collector.record({
            name: 'middleware.error',
            type: 'counter',
            value: 1,
            labels: { code: result.error.code, method, strategy: this.strategyLabel },
            timestamp: Date.now(),
          });
        }
      }

      return result;
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;

      // Record execution time for errors
      this.collector.record({
        name: 'middleware.execution_time',
        type: 'histogram',
        value: executionTimeMs,
        labels: { method, strategy: this.strategyLabel, success: 'false' },
        timestamp: Date.now(),
      });

      // Record error
      this.collector.record({
        name: 'middleware.execution.error',
        type: 'counter',
        value: 1,
        labels: { method, strategy: this.strategyLabel },
        timestamp: Date.now(),
      });

      const errorCode = error instanceof Error ? error.name : 'UNKNOWN_ERROR';
      this.collector.record({
        name: 'middleware.error',
        type: 'counter',
        value: 1,
        labels: { code: errorCode, method, strategy: this.strategyLabel },
        timestamp: Date.now(),
      });

      throw error;
    }
  }

  /**
   * Get the metrics collector.
   *
   * @returns The metrics collector instance
   */
  getCollector(): IMiddlewareMetricsCollector {
    return this.collector;
  }

  /**
   * Get the wrapped strategy.
   *
   * @returns The wrapped middleware strategy
   */
  getWrappedStrategy(): IMiddlewareStrategy {
    return this.wrappedStrategy;
  }

  /**
   * Get current metrics snapshot.
   *
   * @returns Current metrics snapshot
   */
  getMetricsSnapshot(): MiddlewareMetricsSnapshot {
    return this.collector.getSnapshot();
  }

  /**
   * Reset all collected metrics.
   */
  resetMetrics(): void {
    this.collector.reset();
  }
}
