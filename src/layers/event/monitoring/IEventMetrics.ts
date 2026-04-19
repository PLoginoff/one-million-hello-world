/**
 * IEventMetrics - Monitoring Interface
 * 
 * Interface for collecting and reporting event metrics.
 * Provides observability into event system performance.
 */

export interface EventMetrics {
  totalEventsPublished: number;
  totalEventsHandled: number;
  totalErrors: number;
  avgProcessingTime: number;
  p95ProcessingTime: number;
  p99ProcessingTime: number;
  currentQueueSize: number;
  activeSubscriptions: number;
  eventsByType: Record<string, number>;
  errorsByType: Record<string, number>;
}

export interface TimeSeriesDataPoint {
  timestamp: Date;
  value: number;
}

export interface IEventMetrics {
  recordEventPublished(eventType: string): void;
  recordEventHandled(eventType: string, processingTime: number): void;
  recordError(eventType: string, error: Error): void;
  recordQueueSize(size: number): void;
  recordSubscriptionCount(count: number): void;
  getMetrics(): EventMetrics;
  getTimeSeries(metric: string, duration?: number): TimeSeriesDataPoint[];
  reset(): void;
}
