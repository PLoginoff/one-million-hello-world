/**
 * Metrics Collector Implementation
 * 
 * Concrete implementation of IMetricsCollector.
 * Handles performance metrics and monitoring.
 */

import { IMetricsCollector } from '../interfaces/IMetricsCollector';
import {
  MetricValue,
  MetricDefinition,
  MetricData,
  MetricType,
  MetricsConfig,
  PerformanceMetrics,
  OperationMetrics,
  Timer,
} from '../types/metrics-types';

export class MetricsCollector implements IMetricsCollector {
  private _metrics: Map<string, MetricData>;
  private _operationMetrics: Map<string, OperationMetrics>;
  private _config: MetricsConfig;

  constructor(config?: Partial<MetricsConfig>) {
    this._metrics = new Map();
    this._operationMetrics = new Map();
    this._config = {
      enabled: true,
      sampleRate: 1.0,
      retentionPeriod: 3600000,
      enableProfiling: false,
      enableMemoryTracking: false,
      ...config,
    };
  }

  record(name: string, value: number, labels?: Record<string, string>): void {
    if (!this._config.enabled || Math.random() > this._config.sampleRate) {
      return;
    }

    const metric = this._metrics.get(name);
    if (!metric) {
      return;
    }

    const metricValue: MetricValue = {
      value,
      timestamp: new Date(),
      labels: labels || {},
    };

    metric.values.push(metricValue);
    this._cleanupOldValues(metric);
  }

  increment(name: string, value?: number, labels?: Record<string, string>): void {
    this.record(name, value || 1, labels);
  }

  decrement(name: string, value?: number, labels?: Record<string, string>): void {
    this.record(name, -(value || 1), labels);
  }

  gauge(name: string, value: number, labels?: Record<string, string>): void {
    this.record(name, value, labels);
  }

  timing(name: string, duration: number, labels?: Record<string, string>): void {
    this.record(name, duration, labels);
  }

  histogram(name: string, value: number, labels?: Record<string, string>): void {
    this.record(name, value, labels);
  }

  registerMetric(definition: MetricDefinition): void {
    const metricData: MetricData = {
      definition,
      values: [],
      aggregation: {
        sum: 0,
        count: 0,
        min: Infinity,
        max: -Infinity,
        average: 0,
        percentile50: 0,
        percentile90: 0,
        percentile95: 0,
        percentile99: 0,
      },
    };

    this._metrics.set(definition.name, metricData);
  }

  unregisterMetric(name: string): void {
    this._metrics.delete(name);
  }

  getMetric(name: string): MetricData | undefined {
    return this._metrics.get(name);
  }

  getAllMetrics(): Map<string, MetricData> {
    return new Map(this._metrics);
  }

  getMetricsByType(type: MetricType): MetricData[] {
    const result: MetricData[] = [];

    for (const metric of this._metrics.values()) {
      if (metric.definition.type === type) {
        result.push(metric);
      }
    }

    return result;
  }

  getMetricsWithLabels(labels: Record<string, string>): MetricData[] {
    const result: MetricData[] = [];

    for (const metric of this._metrics.values()) {
      for (const value of metric.values) {
        let matches = true;

        for (const [key, val] of Object.entries(labels)) {
          if (value.labels[key] !== val) {
            matches = false;
            break;
          }
        }

        if (matches) {
          result.push(metric);
          break;
        }
      }
    }

    return result;
  }

  resetMetric(name: string): void {
    const metric = this._metrics.get(name);
    if (metric) {
      metric.values = [];
      metric.aggregation = this._createEmptyAggregation();
    }
  }

  resetAll(): void {
    for (const metric of this._metrics.values()) {
      metric.values = [];
      metric.aggregation = this._createEmptyAggregation();
    }
  }

  setConfig(config: Partial<MetricsConfig>): void {
    this._config = { ...this._config, ...config };
  }

  getConfig(): MetricsConfig {
    return { ...this._config };
  }

  createTimer(name: string, labels?: Record<string, string>): Timer {
    const startTime = Date.now();

    return {
      start: () => {
        // Timer started at creation
      },
      stop: () => {
        const duration = Date.now() - startTime;
        this.timing(name, duration, labels);
        return duration;
      },
      elapsed: () => {
        return Date.now() - startTime;
      },
    };
  }

  recordPerformance(operation: string, metrics: PerformanceMetrics): void {
    let opMetrics = this._operationMetrics.get(operation);

    if (!opMetrics) {
      opMetrics = {
        operation,
        totalCount: 0,
        successCount: 0,
        failureCount: 0,
        averageDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        p50Duration: 0,
        p90Duration: 0,
        p95Duration: 0,
        p99Duration: 0,
      };
      this._operationMetrics.set(operation, opMetrics);
    }

    const duration = metrics.duration;
    opMetrics.totalCount++;

    if (duration < opMetrics.minDuration) {
      opMetrics.minDuration = duration;
    }

    if (duration > opMetrics.maxDuration) {
      opMetrics.maxDuration = duration;
    }

    opMetrics.averageDuration =
      (opMetrics.averageDuration * (opMetrics.totalCount - 1) + duration) / opMetrics.totalCount;
  }

  getOperationMetrics(operation: string): OperationMetrics {
    return this._operationMetrics.get(operation) || {
      operation,
      totalCount: 0,
      successCount: 0,
      failureCount: 0,
      averageDuration: 0,
      minDuration: 0,
      maxDuration: 0,
      p50Duration: 0,
      p90Duration: 0,
      p95Duration: 0,
      p99Duration: 0,
    };
  }

  getAllOperationMetrics(): Map<string, OperationMetrics> {
    return new Map(this._operationMetrics);
  }

  exportMetrics(format: 'json' | 'prometheus' | 'csv'): string {
    switch (format) {
      case 'json':
        return this._exportJson();
      case 'prometheus':
        return this._exportPrometheus();
      case 'csv':
        return this._exportCsv();
      default:
        return '';
    }
  }

  clear(): void {
    this._metrics.clear();
    this._operationMetrics.clear();
  }

  getMetricCount(): number {
    return this._metrics.size;
  }

  hasMetric(name: string): boolean {
    return this._metrics.has(name);
  }

  private _cleanupOldValues(metric: MetricData): void {
    const now = Date.now();
    metric.values = metric.values.filter((v) => now - v.timestamp.getTime() < this._config.retentionPeriod);
  }

  private _createEmptyAggregation() {
    return {
      sum: 0,
      count: 0,
      min: Infinity,
      max: -Infinity,
      average: 0,
      percentile50: 0,
      percentile90: 0,
      percentile95: 0,
      percentile99: 0,
    };
  }

  private _exportJson(): string {
    const obj: Record<string, unknown> = {};

    for (const [name, metric] of this._metrics) {
      obj[name] = {
        definition: metric.definition,
        aggregation: metric.aggregation,
        valueCount: metric.values.length,
      };
    }

    return JSON.stringify(obj, null, 2);
  }

  private _exportPrometheus(): string {
    const lines: string[] = [];

    for (const [name, metric] of this._metrics) {
      lines.push(`# TYPE ${name} ${metric.definition.type.toLowerCase()}`);
      lines.push(`# HELP ${name} ${metric.definition.description}`);

      if (metric.values.length > 0) {
        const lastValue = metric.values[metric.values.length - 1];
        const labels = Object.entries(lastValue.labels)
          .map(([k, v]) => `${k}="${v}"`)
          .join(',');
        lines.push(`${name}{${labels}} ${lastValue.value}`);
      }
    }

    return lines.join('\n');
  }

  private _exportCsv(): string {
    const lines: string[] = ['name,type,value,timestamp'];

    for (const [name, metric] of this._metrics) {
      for (const value of metric.values) {
        const labels = Object.entries(value.labels).map(([k, v]) => `${k}=${v}`).join(';');
        lines.push(`${name},${metric.definition.type},${value.value},${value.timestamp.toISOString()},${labels}`);
      }
    }

    return lines.join('\n');
  }
}
