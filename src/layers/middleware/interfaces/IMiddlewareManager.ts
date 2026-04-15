/**
 * Middleware Manager Interface
 * 
 * Defines the contract for middleware operations
 * including logging, metrics, tracing, and correlation IDs.
 */

import { HttpRequest } from '../../http-parser/types/http-parser-types';
import {
  LogEntry,
  MetricData,
  TraceSpan,
  CorrelationContext,
  MiddlewareConfig,
  LogLevel,
  LogCategory,
  MetricStatistics,
  SpanStatus,
  SpanError,
  SpanEvent,
  SpanLink,
  MiddlewareHealthStatus,
  MiddlewareDiagnostics,
  MiddlewareStatistics,
  LogFilter,
  MetricFilter,
  SpanFilter,
  MiddlewarePipeline,
  PipelineStage,
  LogAggregationResult,
  MetricAggregationResult,
} from '../types/middleware-types';

/**
 * Interface for middleware operations
 */
export interface IMiddlewareManager {
  /**
   * Logs a message with specified level
   * 
   * @param level - Log level
   * @param message - Log message
   * @param context - Additional context
   */
  log(level: LogLevel, message: string, context?: Record<string, unknown>): void;

  /**
   * Logs a message with category
   * 
   * @param level - Log level
   * @param category - Log category
   * @param message - Log message
   * @param context - Additional context
   */
  logWithCategory(level: LogLevel, category: LogCategory, message: string, context?: Record<string, unknown>): void;

  /**
   * Records a metric
   * 
   * @param metric - Metric data to record
   */
  recordMetric(metric: MetricData): void;

  /**
   * Gets metric statistics
   * 
   * @param metricName - Name of the metric
   * @returns Metric statistics
   */
  getMetricStatistics(metricName: string): MetricStatistics;

  /**
   * Creates a new trace span
   * 
   * @param operationName - Name of the operation
   * @param parentSpanId - Optional parent span ID
   * @returns Created trace span
   */
  createSpan(operationName: string, parentSpanId?: string): TraceSpan;

  /**
   * Finishes a trace span
   * 
   * @param span - Span to finish
   */
  finishSpan(span: TraceSpan): void;

  /**
   * Adds an event to a span
   * 
   * @param span - Span to add event to
   * @param event - Event to add
   */
  addSpanEvent(span: TraceSpan, event: SpanEvent): void;

  /**
   * Adds a link to a span
   * 
   * @param span - Span to add link to
   * @param link - Link to add
   */
  addSpanLink(span: TraceSpan, link: SpanLink): void;

  /**
   * Sets span status
   * 
   * @param span - Span to set status for
   * @param status - Status to set
   * @param error - Optional error details
   */
  setSpanStatus(span: TraceSpan, status: SpanStatus, error?: SpanError): void;

  /**
   * Gets or creates correlation context
   * 
   * @param request - HTTP request
   * @returns Correlation context
   */
  getCorrelationContext(request: HttpRequest): CorrelationContext;

  /**
   * Sets middleware configuration
   * 
   * @param config - Middleware configuration
   */
  setConfig(config: MiddlewareConfig): void;

  /**
   * Gets current middleware configuration
   * 
   * @returns Current middleware configuration
   */
  getConfig(): MiddlewareConfig;

  /**
   * Gets all log entries
   * 
   * @returns Array of log entries
   */
  getLogs(): LogEntry[];

  /**
   * Gets filtered log entries
   * 
   * @param filter - Log filter
   * @returns Filtered log entries
   */
  getFilteredLogs(filter: LogFilter): LogEntry[];

  /**
   * Gets all metrics
   * 
   * @returns Array of metric data
   */
  getMetrics(): MetricData[];

  /**
   * Gets filtered metrics
   * 
   * @param filter - Metric filter
   * @returns Filtered metrics
   */
  getFilteredMetrics(filter: MetricFilter): MetricData[];

  /**
   * Gets all spans
   * 
   * @returns Array of trace spans
   */
  getSpans(): TraceSpan[];

  /**
   * Gets filtered spans
   * 
   * @param filter - Span filter
   * @returns Filtered spans
   */
  getFilteredSpans(filter: SpanFilter): TraceSpan[];

  /**
   * Clears all logs
   */
  clearLogs(): void;

  /**
   * Clears all metrics
   */
  clearMetrics(): void;

  /**
   * Clears all spans
   */
  clearSpans(): void;

  /**
   * Clears all correlation contexts
   */
  clearCorrelationContexts(): void;

  /**
   * Gets health status
   * 
   * @returns Middleware health status
   */
  getHealthStatus(): MiddlewareHealthStatus;

  /**
   * Runs diagnostics
   * 
   * @returns Middleware diagnostics
   */
  runDiagnostics(): MiddlewareDiagnostics;

  /**
   * Gets statistics
   * 
   * @returns Middleware statistics
   */
  getStatistics(): MiddlewareStatistics;

  /**
   * Resets statistics
   */
  resetStatistics(): void;

  /**
   * Aggregates logs
   * 
   * @param filter - Optional log filter
   * @returns Log aggregation result
   */
  aggregateLogs(filter?: LogFilter): LogAggregationResult;

  /**
   * Aggregates metrics
   * 
   * @param metricName - Name of the metric
   * @param filter - Optional metric filter
   * @returns Metric aggregation result
   */
  aggregateMetrics(metricName: string, filter?: MetricFilter): MetricAggregationResult;

  /**
   * Adds a pipeline
   * 
   * @param pipeline - Pipeline to add
   */
  addPipeline(pipeline: MiddlewarePipeline): void;

  /**
   * Removes a pipeline
   * 
   * @param pipelineName - Name of the pipeline to remove
   */
  removePipeline(pipelineName: string): void;

  /**
   * Gets a pipeline
   * 
   * @param pipelineName - Name of the pipeline
   * @returns Pipeline or undefined
   */
  getPipeline(pipelineName: string): MiddlewarePipeline | undefined;

  /**
   * Gets all pipelines
   * 
   * @returns Array of pipelines
   */
  getPipelines(): MiddlewarePipeline[];

  /**
   * Adds a stage to a pipeline
   * 
   * @param pipelineName - Name of the pipeline
   * @param stage - Stage to add
   */
  addPipelineStage(pipelineName: string, stage: PipelineStage): void;

  /**
   * Removes a stage from a pipeline
   * 
   * @param pipelineName - Name of the pipeline
   * @param stageName - Name of the stage to remove
   */
  removePipelineStage(pipelineName: string, stageName: string): void;

  /**
   * Enables a pipeline
   * 
   * @param pipelineName - Name of the pipeline
   */
  enablePipeline(pipelineName: string): void;

  /**
   * Disables a pipeline
   * 
   * @param pipelineName - Name of the pipeline
   */
  disablePipeline(pipelineName: string): void;

  /**
   * Flushes metrics
   */
  flushMetrics(): void;

  /**
   * Flushes logs
   */
  flushLogs(): void;

  /**
   * Gets correlation context by request ID
   * 
   * @param requestId - Request ID
   * @returns Correlation context or undefined
   */
  getCorrelationContextByRequestId(requestId: string): CorrelationContext | undefined;

  /**
   * Gets span by span ID
   * 
   * @param spanId - Span ID
   * @returns Span or undefined
   */
  getSpanById(spanId: string): TraceSpan | undefined;

  /**
   * Gets spans by trace ID
   * 
   * @param traceId - Trace ID
   * @returns Array of spans
   */
  getSpansByTraceId(traceId: string): TraceSpan[];
}
