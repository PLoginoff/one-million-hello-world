/**
 * Metrics Layer Types
 * 
 * Type definitions for performance metrics and monitoring.
 */

/**
 * Metric type
 */
export enum MetricType {
  COUNTER = 'COUNTER',
  GAUGE = 'GAUGE',
  HISTOGRAM = 'HISTOGRAM',
  SUMMARY = 'SUMMARY',
}

/**
 * Metric value
 */
export interface MetricValue {
  value: number;
  timestamp: Date;
  labels: Record<string, string>;
}

/**
 * Metric definition
 */
export interface MetricDefinition {
  name: string;
  type: MetricType;
  description: string;
  labels: string[];
  unit?: string;
}

/**
 * Metric data
 */
export interface MetricData {
  definition: MetricDefinition;
  values: MetricValue[];
  aggregation: MetricAggregation;
}

/**
 * Metric aggregation
 */
export interface MetricAggregation {
  sum: number;
  count: number;
  min: number;
  max: number;
  average: number;
  percentile50: number;
  percentile90: number;
  percentile95: number;
  percentile99: number;
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  operation: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  cpuTime: number;
  memoryUsage: MemoryUsage;
  cacheHitRate: number;
  databaseCalls: number;
}

/**
 * Memory usage
 */
export interface MemoryUsage {
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
}

/**
 * Operation metrics
 */
export interface OperationMetrics {
  operation: string;
  totalCount: number;
  successCount: number;
  failureCount: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  p50Duration: number;
  p90Duration: number;
  p95Duration: number;
  p99Duration: number;
}

/**
 * Metrics configuration
 */
export interface MetricsConfig {
  enabled: boolean;
  sampleRate: number;
  retentionPeriod: number;
  enableProfiling: boolean;
  enableMemoryTracking: boolean;
}

/**
 * Metrics collector
 */
export interface MetricsCollector {
  record(metric: MetricValue): void;
  getMetrics(name: string): MetricData | undefined;
  getAllMetrics(): Map<string, MetricData>;
  reset(): void;
}

/**
 * Timer
 */
export interface Timer {
  start(): void;
  stop(): number;
  elapsed(): number;
}
