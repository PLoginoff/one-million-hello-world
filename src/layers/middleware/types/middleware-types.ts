/**
 * Middleware Layer Types
 * 
 * This module defines all type definitions for the Middleware Layer,
 * including logging, metrics, tracing, and correlation IDs.
 */

/**
 * Log level
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  FATAL = 'FATAL',
  TRACE = 'TRACE',
}

/**
 * Log category
 */
export enum LogCategory {
  GENERAL = 'GENERAL',
  HTTP = 'HTTP',
  DATABASE = 'DATABASE',
  CACHE = 'CACHE',
  SECURITY = 'SECURITY',
  PERFORMANCE = 'PERFORMANCE',
  BUSINESS = 'BUSINESS',
  SYSTEM = 'SYSTEM',
}

/**
 * Log entry
 */
export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  correlationId?: string;
  userId?: string;
  category?: LogCategory;
  source?: string;
  stackTrace?: string;
  metadata?: LogMetadata;
}

/**
 * Log metadata
 */
export interface LogMetadata {
  hostname?: string;
  pid?: number;
  environment?: string;
  version?: string;
  tags?: string[];
}

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
 * Metric aggregation type
 */
export enum MetricAggregation {
  SUM = 'SUM',
  AVG = 'AVG',
  MIN = 'MIN',
  MAX = 'MAX',
  COUNT = 'COUNT',
  P50 = 'P50',
  P95 = 'P95',
  P99 = 'P99',
}

/**
 * Metric data
 */
export interface MetricData {
  name: string;
  type: MetricType;
  value: number;
  labels?: Record<string, string>;
  timestamp: Date;
  aggregation?: MetricAggregation;
  unit?: string;
  description?: string;
}

/**
 * Metric statistics
 */
export interface MetricStatistics {
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
}

/**
 * Trace span
 */
export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  tags?: Record<string, unknown>;
  status?: SpanStatus;
  statusCode?: number;
  error?: SpanError;
  events?: SpanEvent[];
  links?: SpanLink[];
}

/**
 * Span status
 */
export enum SpanStatus {
  OK = 'OK',
  ERROR = 'ERROR',
  CANCELLED = 'CANCELLED',
  TIMEOUT = 'TIMEOUT',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Span error
 */
export interface SpanError {
  type: string;
  message: string;
  stack?: string;
  code?: string;
}

/**
 * Span event
 */
export interface SpanEvent {
  timestamp: Date;
  name: string;
  attributes?: Record<string, unknown>;
}

/**
 * Span link
 */
export interface SpanLink {
  traceId: string;
  spanId: string;
  attributes?: Record<string, unknown>;
}

/**
 * Correlation context
 */
export interface CorrelationContext {
  correlationId: string;
  traceId: string;
  userId?: string;
  requestId: string;
  sessionId?: string;
  tenantId?: string;
  parentRequestId?: string;
}

/**
 * Middleware configuration
 */
export interface MiddlewareConfig {
  enableLogging: boolean;
  enableMetrics: boolean;
  enableTracing: boolean;
  enableCorrelation: boolean;
  logLevel: LogLevel;
  metricsFlushInterval: number;
  logRetentionDays?: number;
  metricsRetentionDays?: number;
  enableLogAggregation?: boolean;
  enableMetricAggregation?: boolean;
  enableSpanSampling?: boolean;
  spanSamplingRate?: number;
  enableStructuredLogging?: boolean;
  logOutputFormat?: LogOutputFormat;
  logOutputTarget?: LogOutputTarget;
}

/**
 * Log output format
 */
export enum LogOutputFormat {
  JSON = 'JSON',
  TEXT = 'TEXT',
  PRETTY = 'PRETTY',
}

/**
 * Log output target
 */
export enum LogOutputTarget {
  CONSOLE = 'CONSOLE',
  FILE = 'FILE',
  REMOTE = 'REMOTE',
  BOTH = 'BOTH',
}

/**
 * Middleware health status
 */
export interface MiddlewareHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: HealthCheck[];
  score: number;
  lastCheck: Date;
}

/**
 * Health check
 */
export interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message?: string;
  duration?: number;
  timestamp: Date;
}

/**
 * Middleware diagnostics
 */
export interface MiddlewareDiagnostics {
  traceId: string;
  timestamp: Date;
  steps: DiagnosticStep[];
  summary: DiagnosticSummary;
}

/**
 * Diagnostic step
 */
export interface DiagnosticStep {
  name: string;
  status: 'success' | 'error' | 'warning';
  duration: number;
  message?: string;
  details?: Record<string, unknown>;
}

/**
 * Diagnostic summary
 */
export interface DiagnosticSummary {
  totalSteps: number;
  successfulSteps: number;
  failedSteps: number;
  warningSteps: number;
  overallStatus: 'success' | 'error' | 'warning';
  totalDuration: number;
}

/**
 * Middleware statistics
 */
export interface MiddlewareStatistics {
  totalLogs: number;
  totalMetrics: number;
  totalSpans: number;
  totalCorrelations: number;
  logsByLevel: Record<LogLevel, number>;
  logsByCategory: Record<LogCategory, number>;
  metricsByType: Record<MetricType, number>;
  spansByStatus: Record<SpanStatus, number>;
  averageLogProcessingTime: number;
  averageMetricProcessingTime: number;
  averageSpanProcessingTime: number;
  memoryUsage: number;
  startTime: Date;
  uptime: number;
}

/**
 * Log filter
 */
export interface LogFilter {
  level?: LogLevel;
  category?: LogCategory;
  startTime?: Date;
  endTime?: Date;
  correlationId?: string;
  userId?: string;
  messagePattern?: string;
  limit?: number;
}

/**
 * Metric filter
 */
export interface MetricFilter {
  name?: string;
  type?: MetricType;
  startTime?: Date;
  endTime?: Date;
  labels?: Record<string, string>;
  limit?: number;
}

/**
 * Span filter
 */
export interface SpanFilter {
  traceId?: string;
  operationName?: string;
  status?: SpanStatus;
  startTime?: Date;
  endTime?: Date;
  minDuration?: number;
  maxDuration?: number;
  limit?: number;
}

/**
 * Middleware pipeline
 */
export interface MiddlewarePipeline {
  name: string;
  stages: PipelineStage[];
  enabled: boolean;
  config?: Record<string, unknown>;
}

/**
 * Pipeline stage
 */
export interface PipelineStage {
  name: string;
  type: StageType;
  order: number;
  enabled: boolean;
  config?: Record<string, unknown>;
}

/**
 * Stage type
 */
export enum StageType {
  LOGGING = 'LOGGING',
  METRICS = 'METRICS',
  TRACING = 'TRACING',
  CORRELATION = 'CORRELATION',
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  CACHING = 'CACHING',
  RATE_LIMITING = 'RATE_LIMITING',
  CUSTOM = 'CUSTOM',
}

/**
 * Log aggregation result
 */
export interface LogAggregationResult {
  count: number;
  byLevel: Record<LogLevel, number>;
  byCategory: Record<LogCategory, number>;
  timeRange: {
    start: Date;
    end: Date;
  };
  topMessages: { message: string; count: number }[];
  errors: LogEntry[];
}

/**
 * Metric aggregation result
 */
export interface MetricAggregationResult {
  name: string;
  type: MetricType;
  statistics: MetricStatistics;
  timeRange: {
    start: Date;
    end: Date;
  };
  labels?: Record<string, string>;
}
