/**
 * Metrics Router Strategy
 *
 * Decorator that wraps a router strategy and collects metrics
 * for all routing operations.
 *
 * @module RouterLayer/Strategies
 */

import { IRouterStrategy, RouterStrategyContext, RouterStrategyResult } from './IRouterStrategy';

/**
 * Metric data point for routing operations.
 */
export interface RouterMetric {
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
 * Aggregated metrics for a router strategy.
 */
export interface RouterMetricsSnapshot {
  /** Total number of routing attempts */
  readonly totalRequests: number;
  /** Number of successful routings */
  readonly successfulRequests: number;
  /** Number of failed routings */
  readonly failedRequests: number;
  /** Number of routing errors (exceptions) */
  readonly errorRequests: number;
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
  /** Routes evaluated per request (average) */
  readonly avgRoutesEvaluated: number;
  /** Errors by error code */
  readonly errorsByCode: Record<string, number>;
  /** Requests by HTTP method */
  readonly requestsByMethod: Record<string, number>;
  /** Requests by strategy (for decorated strategies) */
  readonly requestsByStrategy: Record<string, number>;
  /** Timestamp of snapshot */
  readonly timestamp: number;
}

/**
 * Metrics collector interface.
 */
export interface IRouterMetricsCollector {
  /** Record a metric */
  record(metric: RouterMetric): void;
  /** Get current metrics snapshot */
  getSnapshot(): RouterMetricsSnapshot;
  /** Reset all metrics */
  reset(): void;
}

/**
 * In-memory metrics collector implementation.
 */
export class InMemoryRouterMetricsCollector implements IRouterMetricsCollector {
  private readonly metrics: RouterMetric[] = [];
  private readonly maxMetrics: number;

  private totalRequests = 0;
  private successfulRequests = 0;
  private failedRequests = 0;
  private errorRequests = 0;
  private executionTimes: number[] = [];
  private routesEvaluated: number[] = [];
  private errorsByCode: Record<string, number> = {};
  private requestsByMethod: Record<string, number> = {};
  private requestsByStrategy: Record<string, number> = {};

  constructor(maxMetrics: number = 10000) {
    this.maxMetrics = maxMetrics;
  }

  record(metric: RouterMetric): void {
    this.metrics.push(metric);

    // Trim if exceeding max
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }

    // Update aggregates
    switch (metric.name) {
      case 'router.request.total':
        this.totalRequests++;
        break;
      case 'router.request.success':
        this.successfulRequests++;
        break;
      case 'router.request.failed':
        this.failedRequests++;
        break;
      case 'router.request.error':
        this.errorRequests++;
        break;
      case 'router.execution_time':
        this.executionTimes.push(metric.value);
        if (this.executionTimes.length > this.maxMetrics) {
          this.executionTimes.shift();
        }
        break;
      case 'router.routes_evaluated':
        this.routesEvaluated.push(metric.value);
        if (this.routesEvaluated.length > this.maxMetrics) {
          this.routesEvaluated.shift();
        }
        break;
      case 'router.error':
        this.errorsByCode[metric.labels.code] = (this.errorsByCode[metric.labels.code] ?? 0) + 1;
        break;
      case 'router.request.by_method':
        this.requestsByMethod[metric.labels.method] = (this.requestsByMethod[metric.labels.method] ?? 0) + 1;
        break;
      case 'router.request.by_strategy':
        this.requestsByStrategy[metric.labels.strategy] = (this.requestsByStrategy[metric.labels.strategy] ?? 0) + 1;
        break;
    }
  }

  getSnapshot(): RouterMetricsSnapshot {
    const sortedTimes = [...this.executionTimes].sort((a, b) => a - b);
    const sortedRoutes = [...this.routesEvaluated].sort((a, b) => a - b);

    const percentile = (arr: number[], p: number): number => {
      if (arr.length === 0) return 0;
      const index = Math.ceil(arr.length * p) - 1;
      return arr[Math.max(0, index)];
    };

    const sum = (arr: number[]): number => arr.reduce((a, b) => a + b, 0);
    const avg = (arr: number[]): number => (arr.length > 0 ? sum(arr) / arr.length : 0);

    return {
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      errorRequests: this.errorRequests,
      avgExecutionTimeMs: avg(this.executionTimes),
      minExecutionTimeMs: sortedTimes[0] ?? 0,
      maxExecutionTimeMs: sortedTimes[sortedTimes.length - 1] ?? 0,
      p50ExecutionTimeMs: percentile(sortedTimes, 0.5),
      p95ExecutionTimeMs: percentile(sortedTimes, 0.95),
      p99ExecutionTimeMs: percentile(sortedTimes, 0.99),
      avgRoutesEvaluated: avg(this.routesEvaluated),
      errorsByCode: { ...this.errorsByCode },
      requestsByMethod: { ...this.requestsByMethod },
      requestsByStrategy: { ...this.requestsByStrategy },
      timestamp: Date.now(),
    };
  }

  reset(): void {
    this.metrics.length = 0;
    this.totalRequests = 0;
    this.successfulRequests = 0;
    this.failedRequests = 0;
    this.errorRequests = 0;
    this.executionTimes = [];
    this.routesEvaluated = [];
    this.errorsByCode = {};
    this.requestsByMethod = {};
    this.requestsByStrategy = {};
  }

  /**
   * Get all recorded metrics (for debugging/export).
   *
   * @returns Copy of all metrics
   */
  getAllMetrics(): RouterMetric[] {
    return [...this.metrics];
  }
}

/**
 * Metrics router strategy decorator.
 *
 * Wraps an existing router strategy and collects metrics
 * for all routing operations without modifying the core logic.
 */
export class MetricsRouterStrategy implements IRouterStrategy {
  readonly name: string;
  readonly priority: number;

  private readonly wrappedStrategy: IRouterStrategy;
  private readonly collector: IRouterMetricsCollector;
  private readonly strategyLabel: string;

  /**
   * Create a new MetricsRouterStrategy.
   *
   * @param wrappedStrategy - The strategy to wrap with metrics
   * @param collector - Optional custom metrics collector (defaults to in-memory)
   * @param strategyLabel - Optional label for this strategy in metrics (defaults to wrapped strategy name)
   */
  constructor(wrappedStrategy: IRouterStrategy, collector?: IRouterMetricsCollector, strategyLabel?: string) {
    this.wrappedStrategy = wrappedStrategy;
    this.collector = collector ?? new InMemoryRouterMetricsCollector();
    this.strategyLabel = strategyLabel ?? wrappedStrategy.name;
    this.name = `metrics-${wrappedStrategy.name}`;
    this.priority = wrappedStrategy.priority;
  }

  /**
   * Check if the wrapped strategy can handle the context.
   *
   * @param context - The routing context to evaluate
   * @returns True if the wrapped strategy can handle the context
   */
  canHandle(context: RouterStrategyContext): boolean {
    return this.wrappedStrategy.canHandle(context);
  }

  /**
   * Execute the wrapped strategy with metrics collection.
   *
   * @param context - The routing context
   * @returns Promise resolving to the routing result
   */
  async execute(context: RouterStrategyContext): Promise<RouterStrategyResult> {
    const startTime = Date.now();
    const method = context.method.toUpperCase();

    // Record total request
    this.collector.record({
      name: 'router.request.total',
      type: 'counter',
      value: 1,
      labels: { method, strategy: this.strategyLabel },
      timestamp: startTime,
    });

    // Record by method
    this.collector.record({
      name: 'router.request.by_method',
      type: 'counter',
      value: 1,
      labels: { method, strategy: this.strategyLabel },
      timestamp: startTime,
    });

    // Record by strategy
    this.collector.record({
      name: 'router.request.by_strategy',
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
        name: 'router.execution_time',
        type: 'histogram',
        value: executionTimeMs,
        labels: { method, strategy: this.strategyLabel, success: String(result.success) },
        timestamp: Date.now(),
      });

      // Record routes evaluated
      if (result.metadata?.routesEvaluated !== undefined) {
        this.collector.record({
          name: 'router.routes_evaluated',
          type: 'histogram',
          value: result.metadata.routesEvaluated,
          labels: { method, strategy: this.strategyLabel },
          timestamp: Date.now(),
        });
      }

      if (result.success) {
        this.collector.record({
          name: 'router.request.success',
          type: 'counter',
          value: 1,
          labels: { method, strategy: this.strategyLabel },
          timestamp: Date.now(),
        });
      } else {
        this.collector.record({
          name: 'router.request.failed',
          type: 'counter',
          value: 1,
          labels: { method, strategy: this.strategyLabel, errorCode: result.error?.code ?? 'UNKNOWN' },
          timestamp: Date.now(),
        });

        if (result.error?.code) {
          this.collector.record({
            name: 'router.error',
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
        name: 'router.execution_time',
        type: 'histogram',
        value: executionTimeMs,
        labels: { method, strategy: this.strategyLabel, success: 'false' },
        timestamp: Date.now(),
      });

      // Record error
      this.collector.record({
        name: 'router.request.error',
        type: 'counter',
        value: 1,
        labels: { method, strategy: this.strategyLabel },
        timestamp: Date.now(),
      });

      const errorCode = error instanceof Error ? error.name : 'UNKNOWN_ERROR';
      this.collector.record({
        name: 'router.error',
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
  getCollector(): IRouterMetricsCollector {
    return this.collector;
  }

  /**
   * Get the wrapped strategy.
   *
   * @returns The wrapped router strategy
   */
  getWrappedStrategy(): IRouterStrategy {
    return this.wrappedStrategy;
  }

  /**
   * Get current metrics snapshot.
   *
   * @returns Current metrics snapshot
   */
  getMetricsSnapshot(): RouterMetricsSnapshot {
    return this.collector.getSnapshot();
  }

  /**
   * Reset all collected metrics.
   */
  resetMetrics(): void {
    this.collector.reset();
  }
}
