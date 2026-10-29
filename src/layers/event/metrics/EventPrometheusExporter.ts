/**
 * Event Prometheus Exporter
 *
 * Exports event metrics in Prometheus format for scraping.
 * Supports counters, gauges, histograms, and summaries.
 *
 * @module EventLayer/Metrics
 */

import { EventMetricsCollector, EventMetrics, EventMetricSample } from './EventMetricsCollector';

/**
 * Prometheus metric types.
 */
export type PrometheusMetricType = 'counter' | 'gauge' | 'histogram' | 'summary';

/**
 * Prometheus metric definition.
 */
export interface PrometheusMetric {
  /** Metric name */
  name: string;
  /** Metric type */
  type: PrometheusMetricType;
  /** Help text */
  help: string;
  /** Metric value */
  value: number;
  /** Labels */
  labels: Record<string, string>;
  /** Timestamp (Unix milliseconds) */
  timestamp?: number;
  /** Histogram buckets (for histogram type) */
  buckets?: Record<string, number>;
  /** Summary quantiles (for summary type) */
  quantiles?: Record<string, number>;
}

/**
 * Configuration for Prometheus exporter.
 */
export interface EventPrometheusExporterConfig {
  /** Prefix for all metric names */
  metricPrefix: string;
  /** Include timestamp in output */
  includeTimestamp: boolean;
  /** Default labels to add to all metrics */
  defaultLabels: Record<string, string>;
  /** Histogram buckets for latency metrics */
  latencyBuckets: number[];
  /** Enable metric metadata (TYPE, HELP) */
  includeMetadata: boolean;
}

/**
 * Default Prometheus exporter configuration.
 */
export const DEFAULT_PROMETHEUS_CONFIG: EventPrometheusExporterConfig = {
  metricPrefix: 'event_',
  includeTimestamp: true,
  defaultLabels: {},
  latencyBuckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
  includeMetadata: true,
};

/**
 * Event Prometheus Exporter implementation.
 * Converts internal metrics to Prometheus exposition format.
 */
export class EventPrometheusExporter {
  private readonly _collector: EventMetricsCollector;
  private readonly _config: EventPrometheusExporterConfig;
  private _collectionCount: number = 0;

  /**
   * Creates a new EventPrometheusExporter.
   *
   * @param collector - Metrics collector to export
   * @param config - Optional exporter configuration
   */
  constructor(collector: EventMetricsCollector, config: Partial<EventPrometheusExporterConfig> = {}) {
    this._collector = collector;
    this._config = { ...DEFAULT_PROMETHEUS_CONFIG, ...config };
  }

  /**
   * Collects all metrics and returns as Prometheus metrics array.
   *
   * @returns Array of Prometheus metrics
   */
  collect(): PrometheusMetric[] {
    this._collectionCount++;
    const metrics: PrometheusMetric[] = [];
    const eventMetrics = this._collector.getMetrics();
    const timestamp = this._config.includeTimestamp ? Date.now() : undefined;

    // Counters
    metrics.push(...this._collectCounters(eventMetrics, timestamp));
    // Gauges
    metrics.push(...this._collectGauges(eventMetrics, timestamp));
    // Histograms
    metrics.push(...this._collectHistograms(timestamp));

    return metrics;
  }

  /**
   * Collects metrics as Prometheus text format.
   *
   * @returns Prometheus exposition format string
   */
  toPrometheusString(): string {
    const metrics = this.collect();
    const lines: string[] = [];

    // Group by metric name for metadata
    const byName = new Map<string, PrometheusMetric[]>();
    for (const metric of metrics) {
      const existing = byName.get(metric.name) ?? [];
      existing.push(metric);
      byName.set(metric.name, existing);
    }

    for (const [name, metricList] of byName.entries()) {
      if (this._config.includeMetadata) {
        const first = metricList[0];
        lines.push(`# HELP ${name} ${first.help}`);
        lines.push(`# TYPE ${name} ${first.type}`);
      }

      for (const metric of metricList) {
        const labelStr = this._formatLabels(metric.labels);
        const timestampStr = metric.timestamp !== undefined ? ` ${metric.timestamp}` : '';

        if (metric.type === 'histogram' && metric.buckets) {
          // Histogram: output buckets, sum, count
          for (const [le, count] of Object.entries(metric.buckets)) {
            lines.push(`${name}_bucket{${labelStr},le="${le}"} ${count}${timestampStr}`);
          }
          lines.push(`${name}_sum{${labelStr}} ${metric.value}${timestampStr}`);
          lines.push(`${name}_count{${labelStr}} ${metric.buckets['+Inf'] ?? 0}${timestampStr}`);
        } else if (metric.type === 'summary' && metric.quantiles) {
          // Summary: output quantiles, sum, count
          for (const [quantile, value] of Object.entries(metric.quantiles)) {
            lines.push(`${name}{${labelStr},quantile="${quantile}"} ${value}${timestampStr}`);
          }
          lines.push(`${name}_sum{${labelStr}} ${metric.value}${timestampStr}`);
          lines.push(`${name}_count{${labelStr}} 1${timestampStr}`);
        } else {
          // Counter or Gauge
          lines.push(`${name}{${labelStr}} ${metric.value}${timestampStr}`);
        }
      }

      lines.push(''); // Empty line between metrics
    }

    return lines.join('\n');
  }

  /**
   * Collects counter metrics.
   */
  private _collectCounters(eventMetrics: EventMetrics, timestamp?: number): PrometheusMetric[] {
    const metrics: PrometheusMetric[] = [];
    const prefix = this._config.metricPrefix;

    // Total published
    metrics.push({
      name: `${prefix}published_total`,
      type: 'counter',
      help: 'Total number of events published',
      value: eventMetrics.publishedTotal,
      labels: { ...this._config.defaultLabels },
      timestamp,
    });

    // Total handled
    metrics.push({
      name: `${prefix}handled_total`,
      type: 'counter',
      help: 'Total number of events handled',
      value: eventMetrics.handledTotal,
      labels: { ...this._config.defaultLabels },
      timestamp,
    });

    // Total errors
    metrics.push({
      name: `${prefix}errors_total`,
      type: 'counter',
      help: 'Total number of event errors',
      value: eventMetrics.errorTotal,
      labels: { ...this._config.defaultLabels },
      timestamp,
    });

    // Published by type
    for (const [eventType, count] of Object.entries(eventMetrics.eventsByType)) {
      metrics.push({
        name: `${prefix}published_by_type_total`,
        type: 'counter',
        help: 'Total events published by type',
        value: count,
        labels: { ...this._config.defaultLabels, event_type: eventType },
        timestamp,
      });
    }

    // Errors by type
    for (const [errorType, count] of Object.entries(eventMetrics.errorsByType)) {
      metrics.push({
        name: `${prefix}errors_by_type_total`,
        type: 'counter',
        help: 'Total errors by type',
        value: count,
        labels: { ...this._config.defaultLabels, error_type: errorType },
        timestamp,
      });
    }

    // Dead letter metrics
    metrics.push({
      name: `${prefix}deadletter_total`,
      type: 'counter',
      help: 'Total dead letter events',
      value: this._collector.getCounter('event.deadletter.total'),
      labels: { ...this._config.defaultLabels },
      timestamp,
    });

    metrics.push({
      name: `${prefix}deadletter_replay_total`,
      type: 'counter',
      help: 'Total dead letter replays',
      value: eventMetrics.deadLetterReplayCount,
      labels: { ...this._config.defaultLabels },
      timestamp,
    });

    // Subscription changes
    metrics.push({
      name: `${prefix}subscription_changes_total`,
      type: 'counter',
      help: 'Total subscription changes',
      value: this._collector.getCounter('event.subscription.changes'),
      labels: { ...this._config.defaultLabels },
      timestamp,
    });

    return metrics;
  }

  /**
   * Collects gauge metrics.
   */
  private _collectGauges(eventMetrics: EventMetrics, timestamp?: number): PrometheusMetric[] {
    const metrics: PrometheusMetric[] = [];
    const prefix = this._config.metricPrefix;

    // Active subscriptions
    metrics.push({
      name: `${prefix}active_subscriptions`,
      type: 'gauge',
      help: 'Current number of active subscriptions',
      value: eventMetrics.activeSubscriptions,
      labels: { ...this._config.defaultLabels },
      timestamp,
    });

    // Dead letter queue size
    metrics.push({
      name: `${prefix}deadletter_queue_size`,
      type: 'gauge',
      help: 'Current dead letter queue size',
      value: eventMetrics.deadLetterQueueSize,
      labels: { ...this._config.defaultLabels },
      timestamp,
    });

    // Publish rate
    metrics.push({
      name: `${prefix}publish_rate`,
      type: 'gauge',
      help: 'Current publish rate (events/sec)',
      value: eventMetrics.publishRate,
      labels: { ...this._config.defaultLabels },
      timestamp,
    });

    // Handle rate
    metrics.push({
      name: `${prefix}handle_rate`,
      type: 'gauge',
      help: 'Current handle rate (events/sec)',
      value: eventMetrics.handleRate,
      labels: { ...this._config.defaultLabels },
      timestamp,
    });

    // Error rate
    metrics.push({
      name: `${prefix}error_rate`,
      type: 'gauge',
      help: 'Current error rate (errors/sec)',
      value: this._collector.getGauge('event.error.rate'),
      labels: { ...this._config.defaultLabels },
      timestamp,
    });

    // Uptime
    metrics.push({
      name: `${prefix}uptime_seconds`,
      type: 'gauge',
      help: 'Process uptime in seconds',
      value: this._collector.getUptimeSeconds(),
      labels: { ...this._config.defaultLabels },
      timestamp,
    });

    return metrics;
  }

  /**
   * Collects histogram metrics.
   */
  private _collectHistograms(timestamp?: number): PrometheusMetric[] {
    const metrics: PrometheusMetric[] = [];
    const prefix = this._config.metricPrefix;

    // Publish latency histogram
    const publishLatencies = this._collector.getAllHistogramValues('event.publish.latency');
    if (publishLatencies.length > 0) {
      metrics.push(this._createHistogram(
        `${prefix}publish_latency_seconds`,
        'Event publish latency in seconds',
        publishLatencies,
        timestamp
      ));
    }

    // Handle latency histogram
    const handleLatencies = this._collector.getAllHistogramValues('event.handle.latency');
    if (handleLatencies.length > 0) {
      metrics.push(this._createHistogram(
        `${prefix}handle_latency_seconds`,
        'Event handle latency in seconds',
        handleLatencies,
        timestamp
      ));
    }

    // Combined latency histogram
    const allLatencies = [...publishLatencies, ...handleLatencies];
    if (allLatencies.length > 0) {
      metrics.push(this._createHistogram(
        `${prefix}latency_seconds`,
        'Event latency in seconds',
        allLatencies,
        timestamp
      ));
    }

    return metrics;
  }

  /**
   * Creates a histogram metric from values.
   */
  private _createHistogram(
    name: string,
    help: string,
    values: number[],
    timestamp?: number
  ): PrometheusMetric {
    const sorted = [...values].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    const count = sorted.length;

    // Convert to seconds for Prometheus
    const valuesSec = sorted.map((v) => v / 1000);
    const sumSec = sum / 1000;

    // Calculate buckets
    const buckets: Record<string, number> = {};
    for (const bucket of this._config.latencyBuckets) {
      const bucketSec = bucket / 1000;
      const countInBucket = valuesSec.filter((v) => v <= bucketSec).length;
      buckets[bucketSec.toString()] = countInBucket;
    }
    buckets['+Inf'] = count;

    return {
      name,
      type: 'histogram',
      help,
      value: sumSec,
      labels: { ...this._config.defaultLabels },
      timestamp,
      buckets,
    };
  }

  /**
   * Formats labels for Prometheus output.
   */
  private _formatLabels(labels: Record<string, string>): string {
    return Object.entries(labels)
      .map(([k, v]) => `${k}="${v.replace(/"/g, '\\"')}"`)
      .join(',');
  }

  /**
   * Gets the collection count.
   */
  getCollectionCount(): number {
    return this._collectionCount;
  }

  /**
   * Gets the exporter configuration.
   */
  getConfig(): EventPrometheusExporterConfig {
    return { ...this._config };
  }

  /**
   * Updates the exporter configuration.
   */
  updateConfig(config: Partial<EventPrometheusExporterConfig>): void {
    Object.assign(this._config, config);
  }
}

/**
 * Creates a Prometheus metrics endpoint handler.
 *
 * @param exporter - Prometheus exporter instance
 * @returns Handler function for HTTP requests
 */
export function createPrometheusHandler(exporter: EventPrometheusExporter) {
  return async (): Promise<{ body: string; headers: Record<string, string> }> => {
    const body = exporter.toPrometheusString();
    return {
      body,
      headers: {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        'Content-Length': String(Buffer.byteLength(body)),
      },
    };
  };
}