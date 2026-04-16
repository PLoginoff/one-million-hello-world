/**
 * Metrics Collector Interface
 * 
 * Defines the contract for performance metrics and monitoring.
 */

import {
  MetricValue,
  MetricDefinition,
  MetricData,
  MetricType,
  MetricsConfig,
  MetricsCollector,
  PerformanceMetrics,
  OperationMetrics,
  Timer,
} from '../types/metrics-types';

/**
 * Interface for metrics collection
 */
export interface IMetricsCollector {
  /**
   * Records a metric value
   * 
   * @param name - Metric name
   * @param value - Metric value
   * @param labels - Optional labels
   */
  record(name: string, value: number, labels?: Record<string, string>): void;

  /**
   * Increments a counter metric
   * 
   * @param name - Metric name
   * @param value - Value to increment by
   * @param labels - Optional labels
   */
  increment(name: string, value?: number, labels?: Record<string, string>): void;

  /**
   * Decrements a counter metric
   * 
   * @param name - Metric name
   * @param value - Value to decrement by
   * @param labels - Optional labels
   */
  decrement(name: string, value?: number, labels?: Record<string, string>): void;

  /**
   * Sets a gauge metric
   * 
   * @param name - Metric name
   * @param value - Value to set
   * @param labels - Optional labels
   */
  gauge(name: string, value: number, labels?: Record<string, string>): void;

  /**
   * Records a timing metric
   * 
   * @param name - Metric name
   * @param duration - Duration in milliseconds
   * @param labels - Optional labels
   */
  timing(name: string, duration: number, labels?: Record<string, string>): void;

  /**
   * Records a histogram metric
   * 
   * @param name - Metric name
   * @param value - Value to record
   * @param labels - Optional labels
   */
  histogram(name: string, value: number, labels?: Record<string, string>): void;

  /**
   * Registers a metric definition
   * 
   * @param definition - Metric definition
   */
  registerMetric(definition: MetricDefinition): void;

  /**
   * Unregisters a metric
   * 
   * @param name - Metric name
   */
  unregisterMetric(name: string): void;

  /**
   * Gets metric data
   * 
   * @param name - Metric name
   * @returns Metric data or undefined
   */
  getMetric(name: string): MetricData | undefined;

  /**
   * Gets all metrics
   * 
   * @returns Map of metric name to metric data
   */
  getAllMetrics(): Map<string, MetricData>;

  /**
   * Gets metrics by type
   * 
   * @param type - Metric type
   * @returns Array of metric data
   */
  getMetricsByType(type: MetricType): MetricData[];

  /**
   * Gets metrics with labels
   * 
   * @param labels - Labels to match
   * @returns Array of metric data
   */
  getMetricsWithLabels(labels: Record<string, string>): MetricData[];

  /**
   * Resets a metric
   * 
   * @param name - Metric name
   */
  resetMetric(name: string): void;

  /**
   * Resets all metrics
   */
  resetAll(): void;

  /**
   * Sets metrics configuration
   * 
   * @param config - Metrics configuration
   */
  setConfig(config: Partial<MetricsConfig>): void;

  /**
   * Gets current metrics configuration
   * 
   * @returns Current metrics configuration
   */
  getConfig(): MetricsConfig;

  /**
   * Creates a timer
   * 
   * @param name - Timer name
   * @param labels - Optional labels
   * @returns Timer instance
   */
  createTimer(name: string, labels?: Record<string, string>): Timer;

  /**
   * Records performance metrics for an operation
   * 
   * @param operation - Operation name
   * @param metrics - Performance metrics
   */
  recordPerformance(operation: string, metrics: PerformanceMetrics): void;

  /**
   * Gets operation metrics
   * 
   * @param operation - Operation name
   * @returns Operation metrics
   */
  getOperationMetrics(operation: string): OperationMetrics;

  /**
   * Gets all operation metrics
   * 
   * @returns Map of operation name to operation metrics
   */
  getAllOperationMetrics(): Map<string, OperationMetrics>;

  /**
   * Exports metrics in a specific format
   * 
   * @param format - Export format (json, prometheus, etc.)
   * @returns Exported metrics string
   */
  exportMetrics(format: 'json' | 'prometheus' | 'csv'): string;

  /**
   * Clears all metrics
   */
  clear(): void;

  /**
   * Gets the number of registered metrics
   * 
   * @returns Number of metrics
   */
  getMetricCount(): number;

  /**
   * Checks if a metric is registered
   * 
   * @param name - Metric name
   * @returns Boolean indicating if metric is registered
   */
  hasMetric(name: string): boolean;
}
