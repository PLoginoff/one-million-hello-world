/**
 * Metrics Module
 *
 * Exports metrics and telemetry components.
 */

export type {
  IMetricsCollector,
  AnyMetric,
  CounterMetric,
  GaugeMetric,
  HistogramMetric,
  TimingMetric,
  Metric,
} from './IMetricsCollector';
export { InMemoryMetricsCollector } from './InMemoryMetricsCollector';
export { MetricsRegistry } from './MetricsRegistry';
export { TimingDecorator } from './TimingDecorator';
export { SerializationPrometheusMetricsCollector } from './SerializationPrometheusMetricsCollector';
export type {
  SerializationPrometheusMetrics,
  SerializationMetricSample,
} from './SerializationPrometheusMetricsCollector';
