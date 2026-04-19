/**
 * In-Memory Metrics Collector
 * 
 * Stores metrics in memory.
 */

import { IMetricsCollector, AnyMetric, CounterMetric, GaugeMetric, TimingMetric, HistogramMetric } from './IMetricsCollector';

export class InMemoryMetricsCollector implements IMetricsCollector {
  private _metrics: Map<string, AnyMetric[]>;
  private _maxMetrics: number;

  constructor(maxMetrics: number = 10000) {
    this._metrics = new Map();
    this._maxMetrics = maxMetrics;
  }

  increment(name: string, value: number = 1, tags?: Record<string, string>): void {
    this._addMetric({
      type: 'counter',
      name,
      value,
      timestamp: new Date(),
      tags,
    });
  }

  decrement(name: string, value: number = 1, tags?: Record<string, string>): void {
    this._addMetric({
      type: 'counter',
      name,
      value: -value,
      timestamp: new Date(),
      tags,
    });
  }

  gauge(name: string, value: number, tags?: Record<string, string>): void {
    this._addMetric({
      type: 'gauge',
      name,
      value,
      timestamp: new Date(),
      tags,
    });
  }

  timing(name: string, duration: number, tags?: Record<string, string>): void {
    this._addMetric({
      type: 'timing',
      name,
      value: duration,
      duration,
      timestamp: new Date(),
      tags,
    });
  }

  histogram(name: string, value: number, tags?: Record<string, string>): void {
    this._addMetric({
      type: 'histogram',
      name,
      value,
      timestamp: new Date(),
      tags,
      buckets: [],
    });
  }

  getMetrics(): AnyMetric[] {
    const allMetrics: AnyMetric[] = [];
    for (const metrics of this._metrics.values()) {
      allMetrics.push(...metrics);
    }
    return allMetrics;
  }

  getMetricsByName(name: string): AnyMetric[] {
    return this._metrics.get(name) ?? [];
  }

  clear(): void {
    this._metrics.clear();
  }

  /**
   * Adds a metric to storage
   */
  private _addMetric(metric: AnyMetric): void {
    const metrics = this._metrics.get(metric.name) ?? [];
    metrics.push(metric);

    if (metrics.length > this._maxMetrics) {
      metrics.shift();
    }

    this._metrics.set(metric.name, metrics);
  }

  /**
   * Gets the count of metrics
   */
  getCount(): number {
    let count = 0;
    for (const metrics of this._metrics.values()) {
      count += metrics.length;
    }
    return count;
  }

  /**
   * Gets all metric names
   */
  getMetricNames(): string[] {
    return Array.from(this._metrics.keys());
  }

  /**
   * Aggregates counter metrics
   */
  aggregateCounter(name: string): number {
    const metrics = this.getMetricsByName(name).filter(m => m.type === 'counter');
    return metrics.reduce((sum, m) => sum + m.value, 0);
  }

  /**
   * Gets the latest gauge value
   */
  getLatestGauge(name: string): number | undefined {
    const metrics = this.getMetricsByName(name).filter(m => m.type === 'gauge');
    if (metrics.length === 0) {
      return undefined;
    }
    return metrics[metrics.length - 1].value;
  }

  /**
   * Calculates average timing
   */
  averageTiming(name: string): number {
    const metrics = this.getMetricsByName(name).filter(m => m.type === 'timing');
    if (metrics.length === 0) {
      return 0;
    }
    return metrics.reduce((sum, m) => sum + m.value, 0) / metrics.length;
  }

  /**
   * Gets statistics for a metric
   */
  getStats(name: string): {
    count: number;
    min: number;
    max: number;
    avg: number;
    sum: number;
  } {
    const metrics = this.getMetricsByName(name);
    if (metrics.length === 0) {
      return { count: 0, min: 0, max: 0, avg: 0, sum: 0 };
    }

    const values = metrics.map(m => m.value);
    const sum = values.reduce((a, b) => a + b, 0);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = sum / values.length;

    return { count: values.length, min, max, avg, sum };
  }
}
