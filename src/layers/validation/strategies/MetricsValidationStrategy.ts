/**
 * Metrics Validation Strategy
 *
 * Decorator that wraps a validation strategy and collects metrics
 * for all validation operations.
 *
 * @module ValidationLayer/Strategies
 */

import { IValidationStrategy, ValidationStrategyContext, ValidationStrategyResult } from './IValidationStrategy';

/**
 * Metric data point for validation operations.
 */
export interface ValidationMetric {
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
 * Aggregated metrics for a validation strategy.
 */
export interface ValidationMetricsSnapshot {
  /** Total number of validations */
  readonly totalValidations: number;
  /** Number of successful validations */
  readonly successfulValidations: number;
  /** Number of failed validations */
  readonly failedValidations: number;
  /** Number of validation errors (exceptions) */
  readonly errorValidations: number;
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
  /** Average fields validated per request */
  readonly avgFieldsValidated: number;
  /** Average fields passed per request */
  readonly avgFieldsPassed: number;
  /** Average fields failed per request */
  readonly avgFieldsFailed: number;
  /** Average sanitization time in milliseconds */
  readonly avgSanitizationTimeMs: number;
  /** Errors by error code */
  readonly errorsByCode: Record<string, number>;
  /** Warnings by warning code */
  readonly warningsByCode: Record<string, number>;
  /** Validations by field type */
  readonly validationsByType: Record<string, number>;
  /** Timestamp of snapshot */
  readonly timestamp: number;
}

/**
 * Metrics collector interface.
 */
export interface IValidationMetricsCollector {
  /** Record a metric */
  record(metric: ValidationMetric): void;
  /** Get current metrics snapshot */
  getSnapshot(): ValidationMetricsSnapshot;
  /** Reset all metrics */
  reset(): void;
}

/**
 * In-memory metrics collector implementation.
 */
export class InMemoryValidationMetricsCollector implements IValidationMetricsCollector {
  private readonly metrics: ValidationMetric[] = [];
  private readonly maxMetrics: number;

  private totalValidations = 0;
  private successfulValidations = 0;
  private failedValidations = 0;
  private errorValidations = 0;
  private executionTimes: number[] = [];
  private fieldsValidated: number[] = [];
  private fieldsPassed: number[] = [];
  private fieldsFailed: number[] = [];
  private sanitizationTimes: number[] = [];
  private errorsByCode: Record<string, number> = {};
  private warningsByCode: Record<string, number> = {};
  private validationsByType: Record<string, number> = {};

  constructor(maxMetrics: number = 10000) {
    this.maxMetrics = maxMetrics;
  }

  record(metric: ValidationMetric): void {
    this.metrics.push(metric);

    // Trim if exceeding max
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }

    // Update aggregates
    switch (metric.name) {
      case 'validation.total':
        this.totalValidations++;
        break;
      case 'validation.success':
        this.successfulValidations++;
        break;
      case 'validation.failed':
        this.failedValidations++;
        break;
      case 'validation.error':
        this.errorValidations++;
        break;
      case 'validation.execution_time':
        this.executionTimes.push(metric.value);
        if (this.executionTimes.length > this.maxMetrics) {
          this.executionTimes.shift();
        }
        break;
      case 'validation.fields_validated':
        this.fieldsValidated.push(metric.value);
        if (this.fieldsValidated.length > this.maxMetrics) {
          this.fieldsValidated.shift();
        }
        break;
      case 'validation.fields_passed':
        this.fieldsPassed.push(metric.value);
        if (this.fieldsPassed.length > this.maxMetrics) {
          this.fieldsPassed.shift();
        }
        break;
      case 'validation.fields_failed':
        this.fieldsFailed.push(metric.value);
        if (this.fieldsFailed.length > this.maxMetrics) {
          this.fieldsFailed.shift();
        }
        break;
      case 'validation.sanitization_time':
        this.sanitizationTimes.push(metric.value);
        if (this.sanitizationTimes.length > this.maxMetrics) {
          this.sanitizationTimes.shift();
        }
        break;
      case 'validation.error':
        this.errorsByCode[metric.labels.code] = (this.errorsByCode[metric.labels.code] ?? 0) + 1;
        break;
      case 'validation.warning':
        this.warningsByCode[metric.labels.code] = (this.warningsByCode[metric.labels.code] ?? 0) + 1;
        break;
      case 'validation.by_type':
        this.validationsByType[metric.labels.type] = (this.validationsByType[metric.labels.type] ?? 0) + 1;
        break;
    }
  }

  getSnapshot(): ValidationMetricsSnapshot {
    const sortedTimes = [...this.executionTimes].sort((a, b) => a - b);
    const sortedFieldsValidated = [...this.fieldsValidated].sort((a, b) => a - b);
    const sortedFieldsPassed = [...this.fieldsPassed].sort((a, b) => a - b);
    const sortedFieldsFailed = [...this.fieldsFailed].sort((a, b) => a - b);
    const sortedSanitizationTimes = [...this.sanitizationTimes].sort((a, b) => a - b);

    const percentile = (arr: number[], p: number): number => {
      if (arr.length === 0) return 0;
      const index = Math.ceil(arr.length * p) - 1;
      return arr[Math.max(0, index)];
    };

    const sum = (arr: number[]): number => arr.reduce((a, b) => a + b, 0);
    const avg = (arr: number[]): number => (arr.length > 0 ? sum(arr) / arr.length : 0);

    return {
      totalValidations: this.totalValidations,
      successfulValidations: this.successfulValidations,
      failedValidations: this.failedValidations,
      errorValidations: this.errorValidations,
      avgExecutionTimeMs: avg(this.executionTimes),
      minExecutionTimeMs: sortedTimes[0] ?? 0,
      maxExecutionTimeMs: sortedTimes[sortedTimes.length - 1] ?? 0,
      p50ExecutionTimeMs: percentile(sortedTimes, 0.5),
      p95ExecutionTimeMs: percentile(sortedTimes, 0.95),
      p99ExecutionTimeMs: percentile(sortedTimes, 0.99),
      avgFieldsValidated: avg(this.fieldsValidated),
      avgFieldsPassed: avg(this.fieldsPassed),
      avgFieldsFailed: avg(this.fieldsFailed),
      avgSanitizationTimeMs: avg(this.sanitizationTimes),
      errorsByCode: { ...this.errorsByCode },
      warningsByCode: { ...this.warningsByCode },
      validationsByType: { ...this.validationsByType },
      timestamp: Date.now(),
    };
  }

  reset(): void {
    this.metrics.length = 0;
    this.totalValidations = 0;
    this.successfulValidations = 0;
    this.failedValidations = 0;
    this.errorValidations = 0;
    this.executionTimes = [];
    this.fieldsValidated = [];
    this.fieldsPassed = [];
    this.fieldsFailed = [];
    this.sanitizationTimes = [];
    this.errorsByCode = {};
    this.warningsByCode = {};
    this.validationsByType = {};
  }

  /**
   * Get all recorded metrics (for debugging/export).
   *
   * @returns Copy of all metrics
   */
  getAllMetrics(): ValidationMetric[] {
    return [...this.metrics];
  }
}

/**
 * Metrics validation strategy decorator.
 *
 * Wraps an existing validation strategy and collects metrics
 * for all validation operations without modifying the core logic.
 */
export class MetricsValidationStrategy implements IValidationStrategy {
  readonly name: string;
  readonly priority: number;

  private readonly wrappedStrategy: IValidationStrategy;
  private readonly collector: IValidationMetricsCollector;
  private readonly strategyLabel: string;

  /**
   * Create a new MetricsValidationStrategy.
   *
   * @param wrappedStrategy - The strategy to wrap with metrics
   * @param collector - Optional custom metrics collector (defaults to in-memory)
   * @param strategyLabel - Optional label for this strategy in metrics (defaults to wrapped strategy name)
   */
  constructor(wrappedStrategy: IValidationStrategy, collector?: IValidationMetricsCollector, strategyLabel?: string) {
    this.wrappedStrategy = wrappedStrategy;
    this.collector = collector ?? new InMemoryValidationMetricsCollector();
    this.strategyLabel = strategyLabel ?? wrappedStrategy.name;
    this.name = `metrics-${wrappedStrategy.name}`;
    this.priority = wrappedStrategy.priority;
  }

  /**
   * Check if the wrapped strategy can handle the context.
   *
   * @param context - The validation context to evaluate
   * @returns True if the wrapped strategy can handle the context
   */
  canHandle(context: ValidationStrategyContext): boolean {
    return this.wrappedStrategy.canHandle(context);
  }

  /**
   * Execute the wrapped strategy with metrics collection.
   *
   * @param context - The validation context
   * @returns Promise resolving to the validation result
   */
  async execute(context: ValidationStrategyContext): Promise<ValidationStrategyResult> {
    const startTime = Date.now();

    // Record total validation
    this.collector.record({
      name: 'validation.total',
      type: 'counter',
      value: 1,
      labels: { strategy: this.strategyLabel },
      timestamp: startTime,
    });

    try {
      const result = await this.wrappedStrategy.execute(context);
      const executionTimeMs = Date.now() - startTime;

      // Record execution time
      this.collector.record({
        name: 'validation.execution_time',
        type: 'histogram',
        value: executionTimeMs,
        labels: { strategy: this.strategyLabel, success: String(result.success) },
        timestamp: Date.now(),
      });

      // Record fields validated/passed/failed
      if (result.metadata?.fieldsValidated !== undefined) {
        this.collector.record({
          name: 'validation.fields_validated',
          type: 'histogram',
          value: result.metadata.fieldsValidated,
          labels: { strategy: this.strategyLabel },
          timestamp: Date.now(),
        });
      }

      if (result.metadata?.fieldsPassed !== undefined) {
        this.collector.record({
          name: 'validation.fields_passed',
          type: 'histogram',
          value: result.metadata.fieldsPassed,
          labels: { strategy: this.strategyLabel },
          timestamp: Date.now(),
        });
      }

      if (result.metadata?.fieldsFailed !== undefined) {
        this.collector.record({
          name: 'validation.fields_failed',
          type: 'histogram',
          value: result.metadata.fieldsFailed,
          labels: { strategy: this.strategyLabel },
          timestamp: Date.now(),
        });
      }

      // Record sanitization time
      if (result.metadata?.sanitizationDurationMs !== undefined) {
        this.collector.record({
          name: 'validation.sanitization_time',
          type: 'histogram',
          value: result.metadata.sanitizationDurationMs,
          labels: { strategy: this.strategyLabel },
          timestamp: Date.now(),
        });
      }

      // Record errors by code
      for (const error of result.errors) {
        this.collector.record({
          name: 'validation.error',
          type: 'counter',
          value: 1,
          labels: { code: error.code, strategy: this.strategyLabel },
          timestamp: Date.now(),
        });
      }

      // Record warnings by code
      for (const warning of result.warnings) {
        this.collector.record({
          name: 'validation.warning',
          type: 'counter',
          value: 1,
          labels: { code: warning.code, strategy: this.strategyLabel },
          timestamp: Date.now(),
        });
      }

      // Record field types from schema
      for (const [, fieldValidation] of Object.entries(context.schema.fields ?? {})) {
        this.collector.record({
          name: 'validation.by_type',
          type: 'counter',
          value: 1,
          labels: { type: fieldValidation.type, strategy: this.strategyLabel },
          timestamp: Date.now(),
        });
      }

      if (result.success) {
        this.collector.record({
          name: 'validation.success',
          type: 'counter',
          value: 1,
          labels: { strategy: this.strategyLabel },
          timestamp: Date.now(),
        });
      } else {
        this.collector.record({
          name: 'validation.failed',
          type: 'counter',
          value: 1,
          labels: { strategy: this.strategyLabel },
          timestamp: Date.now(),
        });
      }

      return result;
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;

      // Record execution time for errors
      this.collector.record({
        name: 'validation.execution_time',
        type: 'histogram',
        value: executionTimeMs,
        labels: { strategy: this.strategyLabel, success: 'false' },
        timestamp: Date.now(),
      });

      // Record error
      this.collector.record({
        name: 'validation.error',
        type: 'counter',
        value: 1,
        labels: { strategy: this.strategyLabel },
        timestamp: Date.now(),
      });

      const errorCode = error instanceof Error ? error.name : 'UNKNOWN_ERROR';
      this.collector.record({
        name: 'validation.error',
        type: 'counter',
        value: 1,
        labels: { code: errorCode, strategy: this.strategyLabel },
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
  getCollector(): IValidationMetricsCollector {
    return this.collector;
  }

  /**
   * Get the wrapped strategy.
   *
   * @returns The wrapped validation strategy
   */
  getWrappedStrategy(): IValidationStrategy {
    return this.wrappedStrategy;
  }

  /**
   * Get current metrics snapshot.
   *
   * @returns Current metrics snapshot
   */
  getMetricsSnapshot(): ValidationMetricsSnapshot {
    return this.collector.getSnapshot();
  }

  /**
   * Reset all collected metrics.
   */
  resetMetrics(): void {
    this.collector.reset();
  }
}
