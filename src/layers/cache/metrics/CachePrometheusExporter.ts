/**
 * Cache Prometheus Exporter
 *
 * Exports cache metrics in Prometheus format for scraping.
 * Provides both text-based and programmatic access to metrics.
 *
 * @module CacheLayer/Metrics
 */

import { CacheMetricsCollector, CacheMetrics, CacheMetricSample } from './CacheMetricsCollector';

export interface PrometheusExporterConfig {
  /** Prefix for all metric names */
  metricPrefix?: string;
  /** Include timestamp in output */
  includeTimestamp?: boolean;
  /** Default labels to add to all metrics */
  defaultLabels?: Record<string, string>;
  /** Enable metric descriptions (HELP) */
  includeHelp?: boolean;
  /** Enable metric types (TYPE) */
  includeType?: boolean;
}

/**
 * Cache Prometheus Exporter
 *
 * Converts cache metrics to Prometheus exposition format.
 * Supports both text-based and programmatic access.
 */
export class CachePrometheusExporter {
  private readonly _collector: CacheMetricsCollector;
  private readonly _config: Required<PrometheusExporterConfig>;
  private _exportCount: number = 0;

  constructor(collector: CacheMetricsCollector, config: PrometheusExporterConfig = {}) {
    this._collector = collector;
    this._config = {
      metricPrefix: config.metricPrefix ?? 'cache',
      includeTimestamp: config.includeTimestamp ?? true,
      defaultLabels: config.defaultLabels ?? {},
      includeHelp: config.includeHelp ?? true,
      includeType: config.includeType ?? true,
    };
  }

  /**
   * Export metrics in Prometheus text format
   */
  export(): string {
    this._exportCount++;
    const samples = this._collector.collectAsPrometheusSamples();
    const prefix = this._config.metricPrefix;
    const defaultLabels = this._config.defaultLabels;

    const lines: string[] = [];

    // Emit HELP/TYPE for core metrics
    const coreMetrics = [
      ['hits_total', 'Total cache hits', 'counter'],
      ['misses_total', 'Total cache misses', 'counter'],
      ['hit_rate', 'Cache hit rate (0-1)', 'gauge'],
      ['miss_rate', 'Cache miss rate (0-1)', 'gauge'],
      ['evictions_total', 'Total cache evictions', 'counter'],
      ['size', 'Current cache size', 'gauge'],
      ['total_requests', 'Total cache requests', 'counter'],
      ['avg_latency_ms', 'Average cache latency in ms', 'gauge'],
      ['p50_latency_ms', 'P50 cache latency in ms', 'gauge'],
      ['p90_latency_ms', 'P90 cache latency in ms', 'gauge'],
      ['p95_latency_ms', 'P95 cache latency in ms', 'gauge'],
      ['p99_latency_ms', 'P99 cache latency in ms', 'gauge'],
      ['throughput_per_second', 'Cache throughput (ops/sec)', 'gauge'],
    ];

    if (this._config.includeHelp) {
      for (const [name, help] of coreMetrics) {
        lines.push(`# HELP ${prefix}_${name} ${help}`);
      }
      // Strategy metrics
      lines.push(`# HELP ${prefix}_strategy_executions_total Total executions per strategy`);
      lines.push(`# HELP ${prefix}_strategy_avg_latency_ms Average latency per strategy`);
      lines.push(`# HELP ${prefix}_strategy_hit_rate Hit rate per strategy`);
      lines.push(`# HELP ${prefix}_strategy_error_rate Error rate per strategy`);
      // Operation metrics
      lines.push(`# HELP ${prefix}_operation_executions_total Total executions per operation`);
      lines.push(`# HELP ${prefix}_operation_avg_latency_ms Average latency per operation`);
      lines.push(`# HELP ${prefix}_operation_hit_rate Hit rate per operation`);
      // Level metrics
      lines.push(`# HELP ${prefix}_level_executions_total Total executions per cache level`);
      lines.push(`# HELP ${prefix}_level_avg_latency_ms Average latency per cache level`);
      lines.push(`# HELP ${prefix}_level_hit_rate Hit rate per cache level`);
    }

    if (this._config.includeType) {
      for (const [name, , type] of coreMetrics) {
        lines.push(`# TYPE ${prefix}_${name} ${type}`);
      }
      lines.push(`# TYPE ${prefix}_strategy_executions_total counter`);
      lines.push(`# TYPE ${prefix}_strategy_avg_latency_ms gauge`);
      lines.push(`# TYPE ${prefix}_strategy_hit_rate gauge`);
      lines.push(`# TYPE ${prefix}_strategy_error_rate gauge`);
      lines.push(`# TYPE ${prefix}_operation_executions_total counter`);
      lines.push(`# TYPE ${prefix}_operation_avg_latency_ms gauge`);
      lines.push(`# TYPE ${prefix}_operation_hit_rate gauge`);
      lines.push(`# TYPE ${prefix}_level_executions_total counter`);
      lines.push(`# TYPE ${prefix}_level_avg_latency_ms gauge`);
      lines.push(`# TYPE ${prefix}_level_hit_rate gauge`);
    }

    // Emit samples with prefix and labels
    for (const s of samples) {
      const mergedLabels = { ...defaultLabels, ...s.labels };
      const labels = Object.entries(mergedLabels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(',');
      const labelStr = labels ? `{${labels}}` : '';
      const metricName = s.name.startsWith('cache_') ? `${prefix}_${s.name.slice(6)}` : `${prefix}_${s.name}`;
      const timestamp = this._config.includeTimestamp ? ` ${s.timestamp}` : '';
      lines.push(`${metricName}${labelStr} ${s.value}${timestamp}`);
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Export metrics as structured samples
   */
  exportSamples(): CacheMetricSample[] {
    this._exportCount++;
    return this._collector.collectAsPrometheusSamples();
  }

  /**
   * Export metrics as a structured object
   */
  exportObject(): CacheMetrics & { samples: CacheMetricSample[]; exportCount: number } {
    this._exportCount++;
    const metrics = this._collector.collect();
    const samples = this._collector.collectAsPrometheusSamples();
    return { ...metrics, samples, exportCount: this._exportCount };
  }

  /**
   * Get export count
   */
  getExportCount(): number {
    return this._exportCount;
  }

  /**
   * Create a custom exporter with different prefix
   */
  withPrefix(prefix: string): CachePrometheusExporter {
    return new CachePrometheusExporter(this._collector, {
      ...this._config,
      metricPrefix: prefix,
    });
  }

  /**
   * Create a custom exporter with additional labels
   */
  withLabels(labels: Record<string, string>): CachePrometheusExporter {
    return new CachePrometheusExporter(this._collector, {
      ...this._config,
      defaultLabels: { ...this._config.defaultLabels, ...labels },
    });
  }
}

/**
 * Prometheus Metric Builder
 *
 * Helper for building custom Prometheus metrics programmatically.
 */
export class PrometheusMetricBuilder {
  private _lines: string[] = [];
  private _metrics: Map<string, { help: string; type: string; samples: Array<{ labels: Record<string, string>; value: number; timestamp?: number }> }> = new Map();

  /**
   * Add a counter metric
   */
  counter(name: string, help: string, value: number, labels: Record<string, string> = {}, timestamp?: number): this {
    this._addMetric(name, help, 'counter', value, labels, timestamp);
    return this;
  }

  /**
   * Add a gauge metric
   */
  gauge(name: string, help: string, value: number, labels: Record<string, string> = {}, timestamp?: number): this {
    this._addMetric(name, help, 'gauge', value, labels, timestamp);
    return this;
  }

  /**
   * Add a histogram metric (bucket)
   */
  histogram(name: string, help: string, buckets: Array<{ le: string; value: number }>, labels: Record<string, string> = {}, timestamp?: number): this {
    for (const bucket of buckets) {
      this._addMetric(`${name}_bucket`, help, 'counter', bucket.value, { ...labels, le: bucket.le }, timestamp);
    }
    // Add +Inf bucket
    this._addMetric(`${name}_bucket`, help, 'counter', buckets[buckets.length - 1]?.value ?? 0, { ...labels, le: '+Inf' }, timestamp);
    // Add sum and count
    const sum = buckets.reduce((a, b) => a + b.value, 0);
    this._addMetric(`${name}_sum`, help, 'counter', sum, labels, timestamp);
    this._addMetric(`${name}_count`, help, 'counter', buckets.length, labels, timestamp);
    return this;
  }

  /**
   * Add a summary metric
   */
  summary(name: string, help: string, quantiles: Array<{ quantile: string; value: number }>, sum: number, count: number, labels: Record<string, string> = {}, timestamp?: number): this {
    for (const q of quantiles) {
      this._addMetric(name, help, 'summary', q.value, { ...labels, quantile: q.quantile }, timestamp);
    }
    this._addMetric(`${name}_sum`, help, 'counter', sum, labels, timestamp);
    this._addMetric(`${name}_count`, help, 'counter', count, labels, timestamp);
    return this;
  }

  private _addMetric(
    name: string,
    help: string,
    type: string,
    value: number,
    labels: Record<string, string>,
    timestamp?: number
  ): void {
    const key = `${name}${JSON.stringify(labels)}`;
    let metric = this._metrics.get(key);
    if (!metric) {
      metric = { help, type, samples: [] };
      this._metrics.set(key, metric);
    }
    metric.samples.push({ labels, value, timestamp });
  }

  /**
   * Build the Prometheus output string
   */
  build(includeTimestamp: boolean = true): string {
    const lines: string[] = [];

    for (const [key, metric] of this._metrics.entries()) {
      // Extract name from key (before labels JSON)
      const nameEnd = key.indexOf('{');
      const name = nameEnd > 0 ? key.slice(0, nameEnd) : key;

      if (this._shouldIncludeHelp(metric)) {
        lines.push(`# HELP ${name} ${metric.help}`);
      }
      if (this._shouldIncludeType(metric)) {
        lines.push(`# TYPE ${name} ${metric.type}`);
      }

      for (const sample of metric.samples) {
        const labelStr = this._formatLabels(sample.labels);
        const timestampStr = includeTimestamp && sample.timestamp ? ` ${sample.timestamp}` : '';
        lines.push(`${name}${labelStr} ${sample.value}${timestampStr}`);
      }
    }

    return lines.join('\n') + '\n';
  }

  private _shouldIncludeHelp(metric: { help: string; type: string }): boolean {
    return true; // Could be configurable
  }

  private _shouldIncludeType(metric: { help: string; type: string }): boolean {
    return true; // Could be configurable
  }

  private _formatLabels(labels: Record<string, string>): string {
    if (Object.keys(labels).length === 0) return '';
    return `{${Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',')}}`;
  }

  /**
   * Reset the builder
   */
  reset(): this {
    this._metrics.clear();
    return this;
  }
}

/**
 * Pre-configured exporters for common scenarios
 */
export const PrometheusExporters = {
  /**
   * Standard cache exporter with default settings
   */
  standard(collector: CacheMetricsCollector): CachePrometheusExporter {
    return new CachePrometheusExporter(collector);
  },

  /**
   * Exporter with custom prefix for multi-tenant environments
   */
  multiTenant(collector: CacheMetricsCollector, tenantId: string): CachePrometheusExporter {
    return new CachePrometheusExporter(collector, {
      metricPrefix: `cache_${tenantId}`,
      defaultLabels: { tenant: tenantId },
    });
  },

  /**
   * Exporter for Kubernetes with pod/namespace labels
   */
  kubernetes(collector: CacheMetricsCollector, podName: string, namespace: string): CachePrometheusExporter {
    return new CachePrometheusExporter(collector, {
      defaultLabels: { pod: podName, namespace },
    });
  },

  /**
   * Minimal exporter (no help/type, no timestamp)
   */
  minimal(collector: CacheMetricsCollector): CachePrometheusExporter {
    return new CachePrometheusExporter(collector, {
      includeHelp: false,
      includeType: false,
      includeTimestamp: false,
    });
  },
};