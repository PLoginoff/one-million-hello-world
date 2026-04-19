/**
 * EventMetricsCollector - Monitoring Implementation
 * 
 * Collects and aggregates event metrics for monitoring.
 * Provides time-series data and statistics.
 */

import { IEventMetrics, EventMetrics, TimeSeriesDataPoint } from './IEventMetrics';

export class EventMetricsCollector implements IEventMetrics {
  private _metrics: EventMetrics;
  private _timeSeries: Map<string, TimeSeriesDataPoint[]>;
  private _processingTimes: number[];
  private _maxTimeSeriesPoints: number;

  constructor(maxTimeSeriesPoints: number = 1000) {
    this._metrics = this._createEmptyMetrics();
    this._timeSeries = new Map();
    this._processingTimes = [];
    this._maxTimeSeriesPoints = maxTimeSeriesPoints;
  }

  recordEventPublished(eventType: string): void {
    this._metrics.totalEventsPublished++;
    this._metrics.eventsByType[eventType] = (this._metrics.eventsByType[eventType] || 0) + 1;
    this._recordTimeSeries('events_published', 1);
  }

  recordEventHandled(eventType: string, processingTime: number): void {
    this._metrics.totalEventsHandled++;
    this._processingTimes.push(processingTime);
    this._updateProcessingTimeMetrics();
    this._recordTimeSeries('events_handled', 1);
    this._recordTimeSeries('processing_time', processingTime);
  }

  recordError(eventType: string, error: Error): void {
    this._metrics.totalErrors++;
    this._metrics.errorsByType[eventType] = (this._metrics.errorsByType[eventType] || 0) + 1;
    this._recordTimeSeries('errors', 1);
  }

  recordQueueSize(size: number): void {
    this._metrics.currentQueueSize = size;
    this._recordTimeSeries('queue_size', size);
  }

  recordSubscriptionCount(count: number): void {
    this._metrics.activeSubscriptions = count;
    this._recordTimeSeries('subscription_count', count);
  }

  getMetrics(): EventMetrics {
    return { ...this._metrics };
  }

  getTimeSeries(metric: string, duration?: number): TimeSeriesDataPoint[] {
    const data = this._timeSeries.get(metric) || [];
    
    if (duration) {
      const cutoff = new Date(Date.now() - duration);
      return data.filter(point => point.timestamp >= cutoff);
    }
    
    return [...data];
  }

  reset(): void {
    this._metrics = this._createEmptyMetrics();
    this._timeSeries.clear();
    this._processingTimes = [];
  }

  private _createEmptyMetrics(): EventMetrics {
    return {
      totalEventsPublished: 0,
      totalEventsHandled: 0,
      totalErrors: 0,
      avgProcessingTime: 0,
      p95ProcessingTime: 0,
      p99ProcessingTime: 0,
      currentQueueSize: 0,
      activeSubscriptions: 0,
      eventsByType: {},
      errorsByType: {},
    };
  }

  private _updateProcessingTimeMetrics(): void {
    if (this._processingTimes.length === 0) {
      this._metrics.avgProcessingTime = 0;
      this._metrics.p95ProcessingTime = 0;
      this._metrics.p99ProcessingTime = 0;
      return;
    }

    const sorted = [...this._processingTimes].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    this._metrics.avgProcessingTime = sum / sorted.length;

    const p95Index = Math.floor(sorted.length * 0.95);
    const p99Index = Math.floor(sorted.length * 0.99);
    this._metrics.p95ProcessingTime = sorted[p95Index] || 0;
    this._metrics.p99ProcessingTime = sorted[p99Index] || 0;

    if (this._processingTimes.length > 1000) {
      this._processingTimes = this._processingTimes.slice(-1000);
    }
  }

  private _recordTimeSeries(metric: string, value: number): void {
    if (!this._timeSeries.has(metric)) {
      this._timeSeries.set(metric, []);
    }

    const data = this._timeSeries.get(metric)!;
    data.push({
      timestamp: new Date(),
      value,
    });

    if (data.length > this._maxTimeSeriesPoints) {
      data.shift();
    }
  }
}
