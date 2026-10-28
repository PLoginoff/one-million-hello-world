/**
 * Metrics Collector Interface
 *
 * Defines the contract for metrics collection in the domain layer.
 * Implementations should provide methods for recording metrics
 * and exporting them in various formats.
 */

import { DomainMetricSample, DomainMetrics } from './DomainMetricsCollector';

/**
 * Interface for metrics collectors.
 * Provides methods for recording domain metrics and exporting them.
 */
export interface IMetricsCollector {
  /**
   * Records the creation of a domain entity.
   *
   * @param entityType - Optional type of the entity created
   * @param labels - Optional labels for the metric
   */
  recordEntityCreated(entityType?: string, labels?: Record<string, string>): void;

  /**
   * Records the update of a domain entity.
   *
   * @param entityType - Optional type of the entity updated
   * @param labels - Optional labels for the metric
   */
  recordEntityUpdated(entityType?: string, labels?: Record<string, string>): void;

  /**
   * Records the deletion of a domain entity.
   *
   * @param entityType - Optional type of the entity deleted
   * @param labels - Optional labels for the metric
   */
  recordEntityDeleted(entityType?: string, labels?: Record<string, string>): void;

  /**
   * Records a domain event publication.
   *
   * @param eventType - Optional type of the event published
   * @param labels - Optional labels for the metric
   */
  recordEventPublished(eventType?: string, labels?: Record<string, string>): void;

  /**
   * Records a validation failure.
   *
   * @param entityType - Optional type of the entity that failed validation
   * @param labels - Optional labels for the metric
   */
  recordValidationFailure(entityType?: string, labels?: Record<string, string>): void;

  /**
   * Records a policy violation.
   *
   * @param policyName - Name of the violated policy
   * @param violationType - Type of violation
   * @param labels - Optional labels for the metric
   */
  recordPolicyViolation(policyName: string, violationType: string, labels?: Record<string, string>): void;

  /**
   * Records an entity not found error.
   *
   * @param entityType - Type of the entity not found
   * @param labels - Optional labels for the metric
   */
  recordEntityNotFound(entityType: string, labels?: Record<string, string>): void;

  /**
   * Records a concurrency conflict.
   *
   * @param entityType - Type of the entity with conflict
   * @param labels - Optional labels for the metric
   */
  recordConcurrencyConflict(entityType: string, labels?: Record<string, string>): void;

  /**
   * Records the duration of a domain operation.
   *
   * @param operationName - Name of the operation
   * @param durationMs - Duration in milliseconds
   * @param labels - Optional labels for the metric
   */
  recordOperationDuration(operationName: string, durationMs: number, labels?: Record<string, string>): void;

  /**
   * Records the current entity count.
   *
   * @param count - Current number of entities
   * @param entityType - Optional type of entities
   * @param labels - Optional labels for the metric
   */
  recordEntityCount(count: number, entityType?: string, labels?: Record<string, string>): void;

  /**
   * Records the event store lag.
   *
   * @param lag - Number of uncommitted events
   * @param labels - Optional labels for the metric
   */
  recordEventStoreLag(lag: number, labels?: Record<string, string>): void;

  /**
   * Collects all metrics as a structured object.
   *
   * @returns Current metrics snapshot
   */
  collect(): DomainMetrics;

  /**
   * Collects metrics as Prometheus-formatted samples.
   *
   * @returns Array of metric samples
   */
  collectAsPrometheusSamples(): DomainMetricSample[];

  /**
   * Generates Prometheus text format output.
   *
   * @returns Prometheus-formatted metrics string
   */
  toPrometheusString(): string;

  /**
   * Resets all collected metrics to zero.
   */
  reset(): void;

  /**
   * Gets the number of times collect() has been called.
   *
   * @returns Collection count
   */
  getCollectionCount(): number;
}

/**
 * Extended metrics interface with histogram support.
 */
export interface IMetricsCollectorWithHistograms extends IMetricsCollector {
  /**
   * Records a value in a histogram.
   *
   * @param name - Histogram name
   * @param value - Value to record
   * @param labels - Optional labels
   */
  recordHistogram(name: string, value: number, labels?: Record<string, string>): void;

  /**
   * Gets histogram statistics.
   *
   * @param name - Histogram name
   * @returns Histogram statistics or undefined if not found
   */
  getHistogramStats(name: string): HistogramStats | undefined;
}

/**
 * Histogram statistics.
 */
export interface HistogramStats {
  count: number;
  sum: number;
  min: number;
  max: number;
  mean: number;
  percentiles: {
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  };
}

/**
 * Metrics collector configuration.
 */
export interface MetricsCollectorConfig {
  /** Maximum number of samples to retain for histograms */
  maxHistogramSamples: number;
  /** Whether to include default labels on all metrics */
  includeDefaultLabels: boolean;
  /** Default labels to include on all metrics */
  defaultLabels: Record<string, string>;
  /** Whether to enable histogram collection */
  enableHistograms: boolean;
}

/**
 * Default metrics collector configuration.
 */
export const DEFAULT_METRICS_COLLECTOR_CONFIG: MetricsCollectorConfig = {
  maxHistogramSamples: 1000,
  includeDefaultLabels: true,
  defaultLabels: {},
  enableHistograms: true,
};
