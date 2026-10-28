/**
 * Circuit Breaker Metrics Collector Interface
 *
 * Defines the contract for metrics collection implementations.
 *
 * @module CircuitBreakerLayer/Interfaces
 */

export interface MetricLabels {
  [key: string]: string;
}

export interface CounterMetric {
  name: string;
  value: number;
  labels: MetricLabels;
  timestamp: number;
}

export interface GaugeMetric {
  name: string;
  value: number;
  labels: MetricLabels;
  timestamp: number;
}

export interface HistogramMetric {
  name: string;
  value: number;
  labels: MetricLabels;
  timestamp: number;
  buckets: number[];
}

export interface MetricsSnapshot {
  counters: CounterMetric[];
  gauges: GaugeMetric[];
  histograms: HistogramMetric[];
  timestamp: number;
}

export interface IMetricsCollector {
  /**
   * Increment a counter metric
   * @param name - Metric name
   * @param value - Increment value (default: 1)
   * @param labels - Optional labels
   */
  incrementCounter(name: string, value?: number, labels?: MetricLabels): void;

  /**
   * Decrement a counter metric
   * @param name - Metric name
   * @param value - Decrement value (default: 1)
   * @param labels - Optional labels
   */
  decrementCounter(name: string, value?: number, labels?: MetricLabels): void;

  /**
   * Set a gauge metric
   * @param name - Metric name
   * @param value - Gauge value
   * @param labels - Optional labels
   */
  setGauge(name: string, value: number, labels?: MetricLabels): void;

  /**
   * Record a histogram value
   * @param name - Metric name
   * @param value - Histogram value
   * @param labels - Optional labels
   */
  recordHistogram(name: string, value: number, labels?: MetricLabels): void;

  /**
   * Record execution timing
   * @param name - Metric name
   * @param durationMs - Duration in milliseconds
   * @param labels - Optional labels
   */
  recordTiming(name: string, durationMs: number, labels?: MetricLabels): void;

  /**
   * Get current metrics snapshot
   * @returns Metrics snapshot
   */
  getSnapshot(): MetricsSnapshot;

  /**
   * Reset all metrics
   */
  reset(): void;

  /**
   * Get collector name
   * @returns Collector name
   */
  getName(): string;
}
