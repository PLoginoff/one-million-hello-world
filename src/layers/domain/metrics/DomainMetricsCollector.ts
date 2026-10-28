/**
 * Domain Metrics Collector
 *
 * Collects and exposes metrics for the domain layer.
 * Implements IMetricsCollector interface for structured metrics collection
 * with support for Prometheus export and histogram tracking.
 */

import {
  IMetricsCollector,
  IMetricsCollectorWithHistograms,
  MetricsCollectorConfig,
  DEFAULT_METRICS_COLLECTOR_CONFIG,
  HistogramStats,
} from './IMetricsCollector';

export interface DomainMetrics {
  domainEntitiesCreatedTotal: number;
  domainEntitiesUpdatedTotal: number;
  domainEntitiesDeletedTotal: number;
  domainEventsPublishedTotal: number;
  domainValidationFailuresTotal: number;
  domainPolicyViolationsTotal: number;
  domainEntityNotFoundTotal: number;
  domainConcurrencyConflictsTotal: number;
  domainOperationDurationMs: number;
  domainEntityCount: number;
  domainEventStoreLag: number;
  collectedAt: number;
}

export interface DomainMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

interface HistogramData {
  values: number[];
  maxSamples: number;
  sum: number;
  count: number;
  min: number;
  max: number;
}

export class DomainMetricsCollector implements IMetricsCollectorWithHistograms {
  private _metrics: DomainMetrics;
  private _collectionCount: number;
  private _histograms: Map<string, HistogramData>;
  private _config: MetricsCollectorConfig;
  private _operationDurations: Map<string, number[]>;

  constructor(config: Partial<MetricsCollectorConfig> = {}) {
    this._config = { ...DEFAULT_METRICS_COLLECTOR_CONFIG, ...config };
    this._metrics = this._createEmptyMetrics();
    this._collectionCount = 0;
    this._histograms = new Map();
    this._operationDurations = new Map();
  }

  private _createEmptyMetrics(): DomainMetrics {
    return {
      domainEntitiesCreatedTotal: 0,
      domainEntitiesUpdatedTotal: 0,
      domainEntitiesDeletedTotal: 0,
      domainEventsPublishedTotal: 0,
      domainValidationFailuresTotal: 0,
      domainPolicyViolationsTotal: 0,
      domainEntityNotFoundTotal: 0,
      domainConcurrencyConflictsTotal: 0,
      domainOperationDurationMs: 0,
      domainEntityCount: 0,
      domainEventStoreLag: 0,
      collectedAt: 0,
    };
  }

  private _getDefaultLabels(): Record<string, string> {
    return this._config.includeDefaultLabels ? { ...this._config.defaultLabels } : {};
  }

  private _mergeLabels(additionalLabels?: Record<string, string>): Record<string, string> {
    const defaultLabels = this._getDefaultLabels();
    return additionalLabels ? { ...defaultLabels, ...additionalLabels } : defaultLabels;
  }

  private _recordHistogram(name: string, value: number): void {
    if (!this._config.enableHistograms) return;

    let histogram = this._histograms.get(name);
    if (!histogram) {
      histogram = {
        values: [],
        maxSamples: this._config.maxHistogramSamples,
        sum: 0,
        count: 0,
        min: value,
        max: value,
      };
      this._histograms.set(name, histogram);
    }

    histogram.values.push(value);
    histogram.sum += value;
    histogram.count++;
    histogram.min = Math.min(histogram.min, value);
    histogram.max = Math.max(histogram.max, value);

    if (histogram.values.length > histogram.maxSamples) {
      const removed = histogram.values.shift()!;
      histogram.sum -= removed;
      histogram.count--;
      // Recalculate min/max if needed (simplified - could be optimized)
      if (removed === histogram.min || removed === histogram.max) {
        histogram.min = Math.min(...histogram.values);
        histogram.max = Math.max(...histogram.values);
      }
    }
  }

  private _calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  recordEntityCreated(entityType?: string, labels?: Record<string, string>): void {
    this._metrics.domainEntitiesCreatedTotal++;
    this._recordHistogram('domain_entity_created', 1);
  }

  recordEntityUpdated(entityType?: string, labels?: Record<string, string>): void {
    this._metrics.domainEntitiesUpdatedTotal++;
    this._recordHistogram('domain_entity_updated', 1);
  }

  recordEntityDeleted(entityType?: string, labels?: Record<string, string>): void {
    this._metrics.domainEntitiesDeletedTotal++;
    this._recordHistogram('domain_entity_deleted', 1);
  }

  recordEventPublished(eventType?: string, labels?: Record<string, string>): void {
    this._metrics.domainEventsPublishedTotal++;
    this._recordHistogram('domain_event_published', 1);
  }

  recordValidationFailure(entityType?: string, labels?: Record<string, string>): void {
    this._metrics.domainValidationFailuresTotal++;
    this._recordHistogram('domain_validation_failure', 1);
  }

  recordPolicyViolation(policyName: string, violationType: string, labels?: Record<string, string>): void {
    this._metrics.domainPolicyViolationsTotal++;
    this._recordHistogram('domain_policy_violation', 1);
  }

  recordEntityNotFound(entityType: string, labels?: Record<string, string>): void {
    this._metrics.domainEntityNotFoundTotal++;
    this._recordHistogram('domain_entity_not_found', 1);
  }

  recordConcurrencyConflict(entityType: string, labels?: Record<string, string>): void {
    this._metrics.domainConcurrencyConflictsTotal++;
    this._recordHistogram('domain_concurrency_conflict', 1);
  }

  recordOperationDuration(operationName: string, durationMs: number, labels?: Record<string, string>): void {
    this._metrics.domainOperationDurationMs = durationMs;

    let durations = this._operationDurations.get(operationName);
    if (!durations) {
      durations = [];
      this._operationDurations.set(operationName, durations);
    }
    durations.push(durationMs);

    // Keep only last 1000 durations per operation
    if (durations.length > 1000) {
      durations.shift();
    }

    this._recordHistogram(`domain_operation_duration_${operationName}`, durationMs);
  }

  recordEntityCount(count: number, entityType?: string, labels?: Record<string, string>): void {
    this._metrics.domainEntityCount = count;
    this._recordHistogram('domain_entity_count', count);
  }

  recordEventStoreLag(lag: number, labels?: Record<string, string>): void {
    this._metrics.domainEventStoreLag = lag;
    this._recordHistogram('domain_event_store_lag', lag);
  }

  recordHistogram(name: string, value: number, labels?: Record<string, string>): void {
    this._recordHistogram(name, value);
  }

  getHistogramStats(name: string): HistogramStats | undefined {
    const histogram = this._histograms.get(name);
    if (!histogram || histogram.count === 0) return undefined;

    const sorted = [...histogram.values].sort((a, b) => a - b);
    return {
      count: histogram.count,
      sum: histogram.sum,
      min: histogram.min,
      max: histogram.max,
      mean: histogram.sum / histogram.count,
      percentiles: {
        p50: this._calculatePercentile(sorted, 50),
        p90: this._calculatePercentile(sorted, 90),
        p95: this._calculatePercentile(sorted, 95),
        p99: this._calculatePercentile(sorted, 99),
      },
    };
  }

  collect(): DomainMetrics {
    this._collectionCount++;
    return { ...this._metrics, collectedAt: Date.now() };
  }

  collectAsPrometheusSamples(): DomainMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    const samples: DomainMetricSample[] = [
      {
        name: 'domain_entities_created_total',
        value: m.domainEntitiesCreatedTotal,
        labels: this._mergeLabels(),
        timestamp: ts,
      },
      {
        name: 'domain_entities_updated_total',
        value: m.domainEntitiesUpdatedTotal,
        labels: this._mergeLabels(),
        timestamp: ts,
      },
      {
        name: 'domain_entities_deleted_total',
        value: m.domainEntitiesDeletedTotal,
        labels: this._mergeLabels(),
        timestamp: ts,
      },
      {
        name: 'domain_events_published_total',
        value: m.domainEventsPublishedTotal,
        labels: this._mergeLabels(),
        timestamp: ts,
      },
      {
        name: 'domain_validation_failures_total',
        value: m.domainValidationFailuresTotal,
        labels: this._mergeLabels(),
        timestamp: ts,
      },
      {
        name: 'domain_policy_violations_total',
        value: m.domainPolicyViolationsTotal,
        labels: this._mergeLabels(),
        timestamp: ts,
      },
      {
        name: 'domain_entity_not_found_total',
        value: m.domainEntityNotFoundTotal,
        labels: this._mergeLabels(),
        timestamp: ts,
      },
      {
        name: 'domain_concurrency_conflicts_total',
        value: m.domainConcurrencyConflictsTotal,
        labels: this._mergeLabels(),
        timestamp: ts,
      },
      {
        name: 'domain_operation_duration_ms',
        value: m.domainOperationDurationMs,
        labels: this._mergeLabels(),
        timestamp: ts,
      },
      { name: 'domain_entity_count', value: m.domainEntityCount, labels: this._mergeLabels(), timestamp: ts },
      { name: 'domain_event_store_lag', value: m.domainEventStoreLag, labels: this._mergeLabels(), timestamp: ts },
    ];

    // Add histogram stats as samples
    for (const [name, histogram] of this._histograms.entries()) {
      if (histogram.count > 0) {
        const stats = this.getHistogramStats(name);
        if (stats) {
          samples.push(
            { name: `${name}_count`, value: stats.count, labels: this._mergeLabels(), timestamp: ts },
            { name: `${name}_sum`, value: stats.sum, labels: this._mergeLabels(), timestamp: ts },
            { name: `${name}_min`, value: stats.min, labels: this._mergeLabels(), timestamp: ts },
            { name: `${name}_max`, value: stats.max, labels: this._mergeLabels(), timestamp: ts },
            { name: `${name}_mean`, value: stats.mean, labels: this._mergeLabels(), timestamp: ts },
            { name: `${name}_p50`, value: stats.percentiles.p50, labels: this._mergeLabels(), timestamp: ts },
            { name: `${name}_p90`, value: stats.percentiles.p90, labels: this._mergeLabels(), timestamp: ts },
            { name: `${name}_p95`, value: stats.percentiles.p95, labels: this._mergeLabels(), timestamp: ts },
            { name: `${name}_p99`, value: stats.percentiles.p99, labels: this._mergeLabels(), timestamp: ts }
          );
        }
      }
    }

    // Add operation duration stats
    for (const [operationName, durations] of this._operationDurations.entries()) {
      if (durations.length > 0) {
        const sorted = [...durations].sort((a, b) => a - b);
        const sum = durations.reduce((a, b) => a + b, 0);
        samples.push(
          {
            name: `domain_operation_duration_${operationName}_count`,
            value: durations.length,
            labels: this._mergeLabels({ operation: operationName }),
            timestamp: ts,
          },
          {
            name: `domain_operation_duration_${operationName}_sum`,
            value: sum,
            labels: this._mergeLabels({ operation: operationName }),
            timestamp: ts,
          },
          {
            name: `domain_operation_duration_${operationName}_mean`,
            value: sum / durations.length,
            labels: this._mergeLabels({ operation: operationName }),
            timestamp: ts,
          },
          {
            name: `domain_operation_duration_${operationName}_p50`,
            value: this._calculatePercentile(sorted, 50),
            labels: this._mergeLabels({ operation: operationName }),
            timestamp: ts,
          },
          {
            name: `domain_operation_duration_${operationName}_p95`,
            value: this._calculatePercentile(sorted, 95),
            labels: this._mergeLabels({ operation: operationName }),
            timestamp: ts,
          },
          {
            name: `domain_operation_duration_${operationName}_p99`,
            value: this._calculatePercentile(sorted, 99),
            labels: this._mergeLabels({ operation: operationName }),
            timestamp: ts,
          }
        );
      }
    }

    return samples;
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP domain_entities_created_total Total domain entities created',
      '# TYPE domain_entities_created_total counter',
      '# HELP domain_entities_updated_total Total domain entities updated',
      '# TYPE domain_entities_updated_total counter',
      '# HELP domain_entities_deleted_total Total domain entities deleted',
      '# TYPE domain_entities_deleted_total counter',
      '# HELP domain_events_published_total Total domain events published',
      '# TYPE domain_events_published_total counter',
      '# HELP domain_validation_failures_total Total domain validation failures',
      '# TYPE domain_validation_failures_total counter',
      '# HELP domain_policy_violations_total Total domain policy violations',
      '# TYPE domain_policy_violations_total counter',
      '# HELP domain_entity_not_found_total Total domain entity not found errors',
      '# TYPE domain_entity_not_found_total counter',
      '# HELP domain_concurrency_conflicts_total Total domain concurrency conflicts',
      '# TYPE domain_concurrency_conflicts_total counter',
      '# HELP domain_operation_duration_ms Domain operation duration in milliseconds',
      '# TYPE domain_operation_duration_ms gauge',
      '# HELP domain_entity_count Current number of domain entities',
      '# TYPE domain_entity_count gauge',
      '# HELP domain_event_store_lag Number of uncommitted events in event store',
      '# TYPE domain_event_store_lag gauge',
    ];

    // Group samples by name for proper HELP/TYPE comments
    const sampleGroups = new Map<string, DomainMetricSample[]>();
    for (const sample of samples) {
      const group = sampleGroups.get(sample.name) ?? [];
      group.push(sample);
      sampleGroups.set(sample.name, group);
    }

    for (const [name, groupSamples] of sampleGroups.entries()) {
      if (!lines.some((l) => l.includes(name))) {
        const isCounter = name.endsWith('_total') || name.endsWith('_count');
        const isHistogram =
          name.includes('_p50') ||
          name.includes('_p90') ||
          name.includes('_p95') ||
          name.includes('_p99') ||
          name.includes('_mean') ||
          name.includes('_sum') ||
          name.includes('_min') ||
          name.includes('_max');
        lines.push(`# HELP ${name} ${this._generateHelpText(name)}`);
        lines.push(`# TYPE ${name} ${isCounter ? 'counter' : isHistogram ? 'summary' : 'gauge'}`);
      }
      for (const sample of groupSamples) {
        const labelStr =
          Object.entries(sample.labels).length > 0
            ? '{' +
              Object.entries(sample.labels)
                .map(([k, v]) => `${k}="${v}"`)
                .join(',') +
              '}'
            : '';
        lines.push(`${name}${labelStr} ${sample.value} ${sample.timestamp}`);
      }
    }

    return lines.join('\n') + '\n';
  }

  private _generateHelpText(name: string): string {
    const helpTexts: Record<string, string> = {
      domain_entities_created_total: 'Total domain entities created',
      domain_entities_updated_total: 'Total domain entities updated',
      domain_entities_deleted_total: 'Total domain entities deleted',
      domain_events_published_total: 'Total domain events published',
      domain_validation_failures_total: 'Total domain validation failures',
      domain_policy_violations_total: 'Total domain policy violations',
      domain_entity_not_found_total: 'Total domain entity not found errors',
      domain_concurrency_conflicts_total: 'Total domain concurrency conflicts',
      domain_operation_duration_ms: 'Domain operation duration in milliseconds',
      domain_entity_count: 'Current number of domain entities',
      domain_event_store_lag: 'Number of uncommitted events in event store',
    };

    // Check for histogram variants
    for (const [key, value] of Object.entries(helpTexts)) {
      if (name.startsWith(key)) {
        return value;
      }
    }

    return name;
  }

  reset(): void {
    this._metrics = this._createEmptyMetrics();
    this._histograms.clear();
    this._operationDurations.clear();
  }

  getCollectionCount(): number {
    return this._collectionCount;
  }

  /**
   * Gets all histogram names currently being tracked.
   */
  getHistogramNames(): string[] {
    return Array.from(this._histograms.keys());
  }

  /**
   * Gets all operation names being tracked.
   */
  getOperationNames(): string[] {
    return Array.from(this._operationDurations.keys());
  }

  /**
   * Gets the current configuration.
   */
  getConfig(): MetricsCollectorConfig {
    return { ...this._config };
  }

  /**
   * Updates the configuration.
   */
  updateConfig(config: Partial<MetricsCollectorConfig>): void {
    this._config = { ...this._config, ...config };
  }
}
