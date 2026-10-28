/**
 * Metrics Circuit Breaker Strategy
 *
 * Decorator that wraps a circuit breaker strategy and collects metrics
 * for all execution attempts, state transitions, and results.
 *
 * @module CircuitBreakerLayer/Strategies
 */

import {
  ICircuitBreakerStrategy,
  CircuitBreakerContext,
  CircuitBreakerStrategyResult,
} from './ICircuitBreakerStrategy';
import { CircuitState } from '../types/circuit-breaker-types';

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
  /** Fallback executions */
  fallbackExecutions: number;
  /** Average execution duration in ms */
  avgDurationMs: number;
  /** Current circuit state */
  currentState: CircuitState;
  /** Current failure count */
  failureCount: number;
  /** Current success count */
  successCount: number;
  /** State transition counts */
  stateTransitions: Record<CircuitState, number>;
  /** Histogram of execution durations (ms) */
  durationHistogram: number[];
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
      fallbackExecutions: 0,
      avgDurationMs: 0,
      currentState: CircuitState.CLOSED,
      failureCount: 0,
      successCount: 0,
      stateTransitions: {
        [CircuitState.CLOSED]: 0,
        [CircuitState.OPEN]: 0,
        [CircuitState.HALF_OPEN]: 0,
      },
      durationHistogram: [],
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
        break;
      case 'execution.success':
        this._snapshot.successfulExecutions++;
        this.updateDurationHistogram(metric.value);
        break;
      case 'execution.failure':
        this._snapshot.failedExecutions++;
        this.updateDurationHistogram(metric.value);
        break;
      case 'execution.fallback':
        this._snapshot.fallbackExecutions++;
        this.updateDurationHistogram(metric.value);
        break;
      case 'state.transition':
        const toState = metric.tags.to as CircuitState;
        if (toState in this._snapshot.stateTransitions) {
          this._snapshot.stateTransitions[toState]++;
        }
        this._snapshot.currentState = toState;
        break;
      case 'failure.count':
        this._snapshot.failureCount = metric.value;
        break;
      case 'success.count':
        this._snapshot.successCount = metric.value;
        break;
    }

    // Recalculate average duration
    if (this._snapshot.durationHistogram.length > 0) {
      const sum = this._snapshot.durationHistogram.reduce((a, b) => a + b, 0);
      this._snapshot.avgDurationMs = sum / this._snapshot.durationHistogram.length;
    }
  }

  private updateDurationHistogram(durationMs: number): void {
    this._snapshot.durationHistogram.push(durationMs);
    // Keep only last 1000 durations for histogram
    if (this._snapshot.durationHistogram.length > 1000) {
      this._snapshot.durationHistogram.shift();
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
 * Metrics decorator for circuit breaker strategies
 *
 * Wraps a base strategy and collects metrics for all operations.
 *
 * @typeParam T - The type of result returned by the operation
 */
export class MetricsCircuitBreakerStrategy<T = unknown> implements ICircuitBreakerStrategy<T> {
  readonly name: string;
  readonly priority: number;

  private readonly _wrapped: ICircuitBreakerStrategy<T>;
  private readonly _collector: IMetricsCollector;
  private _previousState: CircuitState = CircuitState.CLOSED;

  /**
   * Creates a new MetricsCircuitBreakerStrategy
   *
   * @param wrapped - The base strategy to wrap
   * @param collector - Optional custom metrics collector (defaults to InMemoryMetricsCollector)
   */
  constructor(wrapped: ICircuitBreakerStrategy<T>, collector?: IMetricsCollector) {
    this._wrapped = wrapped;
    this._collector = collector ?? new InMemoryMetricsCollector();
    this.name = `metrics-${wrapped.name}`;
    this.priority = wrapped.priority;
  }

  /**
   * Executes an operation with circuit breaker protection and metrics collection
   *
   * @param context - Execution context
   * @returns Strategy execution result
   */
  async execute(context: CircuitBreakerContext<T>): Promise<CircuitBreakerStrategyResult<T>> {
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
        state: context.state,
      },
    });

    // Check for state transition
    const currentState = this.getWrappedState(context);
    if (currentState !== this._previousState) {
      this._collector.record({
        timestamp: startTime,
        name: 'state.transition',
        value: 1,
        tags: {
          strategy: this._wrapped.name,
          from: this._previousState,
          to: currentState,
        },
      });
      this._previousState = currentState;
    }

    try {
      const result = await this._wrapped.execute(context);
      const durationMs = Date.now() - startTime;

      if (result.success) {
        if (context.fallback && result.attempts > 1) {
          this._collector.record({
            timestamp: Date.now(),
            name: 'execution.fallback',
            value: durationMs,
            tags: {
              strategy: this._wrapped.name,
              operation: operationName,
              state: result.state,
            },
          });
        } else {
          this._collector.record({
            timestamp: Date.now(),
            name: 'execution.success',
            value: durationMs,
            tags: {
              strategy: this._wrapped.name,
              operation: operationName,
              state: result.state,
            },
          });
        }
      } else {
        this._collector.record({
          timestamp: Date.now(),
          name: 'execution.failure',
          value: durationMs,
          tags: {
            strategy: this._wrapped.name,
            operation: operationName,
            state: result.state,
            error: result.error ?? 'unknown',
          },
        });
      }

      // Record current counts if available
      if (
        'getFailureCount' in this._wrapped &&
        typeof (this._wrapped as Record<string, unknown>).getFailureCount === 'function'
      ) {
        const failureCount = ((this._wrapped as Record<string, unknown>).getFailureCount as () => number)();
        this._collector.record({
          timestamp: Date.now(),
          name: 'failure.count',
          value: failureCount,
          tags: { strategy: this._wrapped.name },
        });
      }

      if (
        'getSuccessCount' in this._wrapped &&
        typeof (this._wrapped as Record<string, unknown>).getSuccessCount === 'function'
      ) {
        const successCount = ((this._wrapped as Record<string, unknown>).getSuccessCount as () => number)();
        this._collector.record({
          timestamp: Date.now(),
          name: 'success.count',
          value: successCount,
          tags: { strategy: this._wrapped.name },
        });
      }

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;

      this._collector.record({
        timestamp: Date.now(),
        name: 'execution.failure',
        value: durationMs,
        tags: {
          strategy: this._wrapped.name,
          operation: operationName,
          state: currentState,
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
  canHandle(context: CircuitBreakerContext<unknown>): boolean {
    return this._wrapped.canHandle(context);
  }

  /**
   * Gets the current state from the wrapped strategy
   */
  private getWrappedState(context: CircuitBreakerContext<unknown>): CircuitState {
    if ('getState' in this._wrapped && typeof (this._wrapped as Record<string, unknown>).getState === 'function') {
      return ((this._wrapped as Record<string, unknown>).getState as () => CircuitState)();
    }
    return context.state;
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
    this._previousState = CircuitState.CLOSED;
  }

  /**
   * Gets the wrapped strategy
   *
   * @returns The wrapped strategy instance
   */
  getWrappedStrategy(): ICircuitBreakerStrategy<T> {
    return this._wrapped;
  }
}
