/**
 * Metrics Saga Strategy
 *
 * Decorator that wraps a saga strategy and collects metrics
 * for all execution steps, compensations, and results.
 *
 * @module SagaLayer/Strategies
 */

import { ISagaStrategy, SagaContext, SagaStrategyResult } from './ISagaStrategy';
import { SagaConfig, SagaStep } from '../types/saga-types';

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
  /** Total saga executions */
  totalExecutions: number;
  /** Successful saga executions */
  successfulExecutions: number;
  /** Failed saga executions */
  failedExecutions: number;
  /** Total steps executed across all sagas */
  totalStepsExecuted: number;
  /** Total steps compensated across all sagas */
  totalStepsCompensated: number;
  /** Average steps per saga execution */
  avgStepsPerExecution: number;
  /** Average execution duration in ms */
  avgDurationMs: number;
  /** Average compensation duration in ms */
  avgCompensationDurationMs: number;
  /** Histogram of execution durations (ms) */
  durationHistogram: number[];
  /** Histogram of steps per execution */
  stepsHistogram: number[];
  /** Step execution success rate */
  stepSuccessRate: number;
  /** Step compensation success rate */
  compensationSuccessRate: number;
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
  private _stepSuccessCount: number = 0;
  private _stepTotalCount: number = 0;
  private _compensationSuccessCount: number = 0;
  private _compensationTotalCount: number = 0;

  constructor(maxMetrics: number = 10000) {
    this._maxMetrics = maxMetrics;
    this._snapshot = this.createEmptySnapshot();
  }

  private createEmptySnapshot(): MetricsSnapshot {
    return {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      totalStepsExecuted: 0,
      totalStepsCompensated: 0,
      avgStepsPerExecution: 0,
      avgDurationMs: 0,
      avgCompensationDurationMs: 0,
      durationHistogram: [],
      stepsHistogram: [],
      stepSuccessRate: 0,
      compensationSuccessRate: 0,
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
      case 'saga.execution.start':
        this._snapshot.totalExecutions++;
        break;
      case 'saga.execution.success':
        this._snapshot.successfulExecutions++;
        this._snapshot.totalStepsExecuted += metric.value;
        this.updateDurationHistogram(Number(metric.tags.durationMs) || 0);
        this.updateStepsHistogram(metric.value);
        break;
      case 'saga.execution.failure':
        this._snapshot.failedExecutions++;
        this._snapshot.totalStepsExecuted += metric.value;
        this.updateDurationHistogram(Number(metric.tags.durationMs) || 0);
        this.updateStepsHistogram(metric.value);
        break;
      case 'saga.compensation.start':
        // Compensation started
        break;
      case 'saga.compensation.success':
        this._snapshot.totalStepsCompensated++;
        this.updateCompensationDurationHistogram(Number(metric.tags.durationMs) || 0);
        break;
      case 'step.execution.success':
        this._stepSuccessCount++;
        this._stepTotalCount++;
        break;
      case 'step.execution.failure':
        this._stepTotalCount++;
        break;
      case 'step.compensation.success':
        this._compensationSuccessCount++;
        this._compensationTotalCount++;
        break;
      case 'step.compensation.failure':
        this._compensationTotalCount++;
        break;
    }

    // Recalculate averages
    if (this._snapshot.totalExecutions > 0) {
      this._snapshot.avgStepsPerExecution = this._snapshot.totalStepsExecuted / this._snapshot.totalExecutions;
    }
    if (this._snapshot.durationHistogram.length > 0) {
      const sum = this._snapshot.durationHistogram.reduce((a, b) => a + b, 0);
      this._snapshot.avgDurationMs = sum / this._snapshot.durationHistogram.length;
    }
    if (this._stepTotalCount > 0) {
      this._snapshot.stepSuccessRate = this._stepSuccessCount / this._stepTotalCount;
    }
    if (this._compensationTotalCount > 0) {
      this._snapshot.compensationSuccessRate = this._compensationSuccessCount / this._compensationTotalCount;
    }
  }

  private updateDurationHistogram(durationMs: number): void {
    this._snapshot.durationHistogram.push(durationMs);
    if (this._snapshot.durationHistogram.length > 1000) {
      this._snapshot.durationHistogram.shift();
    }
  }

  private updateStepsHistogram(steps: number): void {
    this._snapshot.stepsHistogram.push(steps);
    if (this._snapshot.stepsHistogram.length > 1000) {
      this._snapshot.stepsHistogram.shift();
    }
  }

  private updateCompensationDurationHistogram(durationMs: number): void {
    // Track compensation duration separately if needed
  }

  getSnapshot(): MetricsSnapshot {
    return { ...this._snapshot };
  }

  reset(): void {
    this._metrics.length = 0;
    this._stepSuccessCount = 0;
    this._stepTotalCount = 0;
    this._compensationSuccessCount = 0;
    this._compensationTotalCount = 0;
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
 * Metrics decorator for saga strategies
 *
 * Wraps a base strategy and collects metrics for all operations.
 *
 * @typeParam T - The type of result returned by the saga
 */
export class MetricsSagaStrategy<T = unknown> implements ISagaStrategy<T> {
  readonly name: string;
  readonly priority: number;

  private readonly _wrapped: ISagaStrategy<T>;
  private readonly _collector: IMetricsCollector;

  /**
   * Creates a new MetricsSagaStrategy
   *
   * @param wrapped - The base strategy to wrap
   * @param collector - Optional custom metrics collector (defaults to InMemoryMetricsCollector)
   */
  constructor(wrapped: ISagaStrategy<T>, collector?: IMetricsCollector) {
    this._wrapped = wrapped;
    this._collector = collector ?? new InMemoryMetricsCollector();
    this.name = `metrics-${wrapped.name}`;
    this.priority = wrapped.priority;
  }

  /**
   * Executes a saga with the given steps and metrics collection
   *
   * @param context - Execution context
   * @returns Strategy execution result
   */
  async execute(context: SagaContext<T>): Promise<SagaStrategyResult<T>> {
    const startTime = Date.now();
    const stepNames = context.steps.map((s) => s.name).join(',');

    // Record execution start
    this._collector.record({
      timestamp: startTime,
      name: 'saga.execution.start',
      value: 1,
      tags: {
        strategy: this._wrapped.name,
        totalSteps: String(context.steps.length),
        steps: stepNames,
        enableCompensation: String(context.enableCompensation),
      },
    });

    try {
      const result = await this._wrapped.execute(context);
      const durationMs = Date.now() - startTime;

      if (result.success) {
        this._collector.record({
          timestamp: Date.now(),
          name: 'saga.execution.success',
          value: result.executedSteps.length,
          tags: {
            strategy: this._wrapped.name,
            executedSteps: result.executedSteps.join(','),
            durationMs: String(durationMs),
          },
        });

        // Record step-level metrics
        for (const stepName of result.executedSteps) {
          const stepDuration = result.stepDurationsMs.get(stepName) ?? 0;
          this._collector.record({
            timestamp: Date.now(),
            name: 'step.execution.success',
            value: stepDuration,
            tags: {
              strategy: this._wrapped.name,
              stepName,
              durationMs: String(stepDuration),
            },
          });
        }
      } else {
        this._collector.record({
          timestamp: Date.now(),
          name: 'saga.execution.failure',
          value: result.executedSteps.length,
          tags: {
            strategy: this._wrapped.name,
            executedSteps: result.executedSteps.join(','),
            compensatedSteps: result.compensatedSteps.join(','),
            durationMs: String(durationMs),
            error: result.error ?? 'unknown',
          },
        });

        // Record step-level metrics for executed steps
        for (const stepName of result.executedSteps) {
          const stepDuration = result.stepDurationsMs.get(stepName) ?? 0;
          this._collector.record({
            timestamp: Date.now(),
            name: 'step.execution.success',
            value: stepDuration,
            tags: {
              strategy: this._wrapped.name,
              stepName,
              durationMs: String(stepDuration),
            },
          });
        }

        // Record step-level metrics for failed step (if any)
        if (result.error) {
          this._collector.record({
            timestamp: Date.now(),
            name: 'step.execution.failure',
            value: 1,
            tags: {
              strategy: this._wrapped.name,
              error: result.error,
            },
          });
        }
      }

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;

      this._collector.record({
        timestamp: Date.now(),
        name: 'saga.execution.failure',
        value: 0,
        tags: {
          strategy: this._wrapped.name,
          durationMs: String(durationMs),
          error: error instanceof Error ? error.message : String(error),
        },
      });

      throw error;
    }
  }

  /**
   * Compensates executed steps in case of failure with metrics collection
   *
   * @param context - Execution context with executed steps
   * @param executedSteps - Names of steps that were executed
   * @param stepData - Data from executed steps
   * @returns Array of compensation results
   */
  async compensate(
    context: SagaContext<T>,
    executedSteps: string[],
    stepData: Map<string, T>
  ): Promise<Array<{ stepName: string; success: boolean; error?: string }>> {
    const startTime = Date.now();

    this._collector.record({
      timestamp: startTime,
      name: 'saga.compensation.start',
      value: executedSteps.length,
      tags: {
        strategy: this._wrapped.name,
        stepsToCompensate: executedSteps.join(','),
      },
    });

    try {
      const results = await this._wrapped.compensate(context, executedSteps, stepData);
      const durationMs = Date.now() - startTime;

      this._collector.record({
        timestamp: Date.now(),
        name: 'saga.compensation.success',
        value: results.filter((r) => r.success).length,
        tags: {
          strategy: this._wrapped.name,
          durationMs: String(durationMs),
          successful: String(results.filter((r) => r.success).length),
          failed: String(results.filter((r) => !r.success).length),
        },
      });

      // Record step-level compensation metrics
      for (const result of results) {
        if (result.success) {
          this._collector.record({
            timestamp: Date.now(),
            name: 'step.compensation.success',
            value: 1,
            tags: {
              strategy: this._wrapped.name,
              stepName: result.stepName,
            },
          });
        } else {
          this._collector.record({
            timestamp: Date.now(),
            name: 'step.compensation.failure',
            value: 1,
            tags: {
              strategy: this._wrapped.name,
              stepName: result.stepName,
              error: result.error ?? 'unknown',
            },
          });
        }
      }

      return results;
    } catch (error) {
      const durationMs = Date.now() - startTime;

      this._collector.record({
        timestamp: Date.now(),
        name: 'saga.compensation.failure',
        value: 0,
        tags: {
          strategy: this._wrapped.name,
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
  canHandle(context: SagaContext<unknown>): boolean {
    return this._wrapped.canHandle(context);
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
  getWrappedStrategy(): ISagaStrategy<T> {
    return this._wrapped;
  }
}
