/**
 * Middleware Manager Implementation
 * 
 * Concrete implementation of IMiddlewareManager.
 * Handles logging, metrics, tracing, and correlation IDs.
 */

import { IMiddlewareManager } from '../interfaces/IMiddlewareManager';
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
  LogOutputFormat,
  LogOutputTarget,
} from '../types/middleware-types';

export class MiddlewareManager implements IMiddlewareManager {
  private _config: MiddlewareConfig;
  private _logs: LogEntry[];
  private _metrics: MetricData[];
  private _spans: Map<string, TraceSpan>;
  private _correlationContexts: Map<string, CorrelationContext>;
  private _pipelines: Map<string, MiddlewarePipeline>;
  private _statistics: MiddlewareStatistics;
  private _startTime: Date;

  constructor() {
    this._config = {
      enableLogging: true,
      enableMetrics: true,
      enableTracing: true,
      enableCorrelation: true,
      logLevel: LogLevel.INFO,
      metricsFlushInterval: 60000,
      logRetentionDays: 7,
      metricsRetentionDays: 30,
      enableLogAggregation: true,
      enableMetricAggregation: true,
      enableSpanSampling: false,
      spanSamplingRate: 1.0,
      enableStructuredLogging: true,
      logOutputFormat: 'JSON' as const,
      logOutputTarget: 'CONSOLE' as const,
    };
    this._logs = [];
    this._metrics = [];
    this._spans = new Map();
    this._correlationContexts = new Map();
    this._pipelines = new Map();
    this._startTime = new Date();
    this._statistics = this._initializeStatistics();
  }

  private _initializeStatistics(): MiddlewareStatistics {
    return {
      totalLogs: 0,
      totalMetrics: 0,
      totalSpans: 0,
      totalCorrelations: 0,
      logsByLevel: {} as Record<LogLevel, number>,
      logsByCategory: {} as Record<LogCategory, number>,
      metricsByType: {} as Record<any, number>,
      spansByStatus: {} as Record<SpanStatus, number>,
      averageLogProcessingTime: 0,
      averageMetricProcessingTime: 0,
      averageSpanProcessingTime: 0,
      memoryUsage: 0,
      startTime: new Date(),
      uptime: 0,
    };
  }

  log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (!this._config.enableLogging) {
      return;
    }

    const logLevelPriority = this._getLogLevelPriority(level);
    const configPriority = this._getLogLevelPriority(this._config.logLevel);

    if (logLevelPriority < configPriority) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      context,
    };

    this._logs.push(entry);
    this._statistics.totalLogs++;
    this._statistics.logsByLevel[level] = (this._statistics.logsByLevel[level] || 0) + 1;
  }

  logWithCategory(level: LogLevel, category: LogCategory, message: string, context?: Record<string, unknown>): void {
    if (!this._config.enableLogging) {
      return;
    }

    const logLevelPriority = this._getLogLevelPriority(level);
    const configPriority = this._getLogLevelPriority(this._config.logLevel);

    if (logLevelPriority < configPriority) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      context,
      category,
    };

    this._logs.push(entry);
    this._statistics.totalLogs++;
    this._statistics.logsByLevel[level] = (this._statistics.logsByLevel[level] || 0) + 1;
    this._statistics.logsByCategory[category] = (this._statistics.logsByCategory[category] || 0) + 1;
  }

  recordMetric(metric: MetricData): void {
    if (!this._config.enableMetrics) {
      return;
    }

    this._metrics.push(metric);
    this._statistics.totalMetrics++;
    this._statistics.metricsByType[metric.type] = (this._statistics.metricsByType[metric.type] || 0) + 1;
  }

  getMetricStatistics(metricName: string): MetricStatistics {
    const metrics = this._metrics.filter(m => m.name === metricName);
    const values = metrics.map(m => m.value);

    if (values.length === 0) {
      return {
        count: 0,
        sum: 0,
        avg: 0,
        min: 0,
        max: 0,
        p50: 0,
        p95: 0,
        p99: 0,
      };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);
    const avg = sum / count;
    const min = sorted[0];
    const max = sorted[count - 1];

    const p50Index = Math.floor(count * 0.5);
    const p95Index = Math.floor(count * 0.95);
    const p99Index = Math.floor(count * 0.99);

    return {
      count,
      sum,
      avg,
      min,
      max,
      p50: sorted[p50Index] || 0,
      p95: sorted[p95Index] || 0,
      p99: sorted[p99Index] || 0,
    };
  }

  createSpan(operationName: string, parentSpanId?: string): TraceSpan {
    if (!this._config.enableTracing) {
      return this._createDummySpan(operationName);
    }

    if (this._config.enableSpanSampling && Math.random() > (this._config.spanSamplingRate || 1.0)) {
      return this._createDummySpan(operationName);
    }

    const span: TraceSpan = {
      traceId: this._generateId(),
      spanId: this._generateId(),
      parentSpanId,
      operationName,
      startTime: new Date(),
      status: SpanStatus.OK,
    };

    this._spans.set(span.spanId, span);
    this._statistics.totalSpans++;
    this._statistics.spansByStatus[SpanStatus.OK] = (this._statistics.spansByStatus[SpanStatus.OK] || 0) + 1;
    return span;
  }

  finishSpan(span: TraceSpan): void {
    if (!this._config.enableTracing) {
      return;
    }

    const existingSpan = this._spans.get(span.spanId);
    if (existingSpan) {
      existingSpan.endTime = new Date();
      existingSpan.duration = existingSpan.endTime.getTime() - existingSpan.startTime.getTime();
      if (existingSpan.status) {
        this._statistics.spansByStatus[existingSpan.status] = (this._statistics.spansByStatus[existingSpan.status] || 0) + 1;
      }
    }
  }

  addSpanEvent(span: TraceSpan, event: SpanEvent): void {
    const existingSpan = this._spans.get(span.spanId);
    if (existingSpan) {
      if (!existingSpan.events) {
        existingSpan.events = [];
      }
      existingSpan.events.push(event);
    }
  }

  addSpanLink(span: TraceSpan, link: SpanLink): void {
    const existingSpan = this._spans.get(span.spanId);
    if (existingSpan) {
      if (!existingSpan.links) {
        existingSpan.links = [];
      }
      existingSpan.links.push(link);
    }
  }

  setSpanStatus(span: TraceSpan, status: SpanStatus, error?: SpanError): void {
    const existingSpan = this._spans.get(span.spanId);
    if (existingSpan) {
      existingSpan.status = status;
      if (error) {
        existingSpan.error = error;
      }
    }
  }

  getCorrelationContext(request: HttpRequest): CorrelationContext {
    if (!this._config.enableCorrelation) {
      return this._createDummyContext();
    }

    const requestId = request.headers.get('x-request-id') || this._generateId();
    const correlationId = request.headers.get('x-correlation-id') || this._generateId();
    const traceId = request.headers.get('x-trace-id') || this._generateId();
    const userId = request.headers.get('x-user-id') || undefined;

    const context: CorrelationContext = {
      correlationId,
      traceId,
      userId,
      requestId,
    };

    this._correlationContexts.set(requestId, context);
    this._statistics.totalCorrelations++;
    return context;
  }

  setConfig(config: MiddlewareConfig): void {
    this._config = { ...this._config, ...config };
  }

  getConfig(): MiddlewareConfig {
    return { ...this._config };
  }

  getLogs(): LogEntry[] {
    return [...this._logs];
  }

  getFilteredLogs(filter: LogFilter): LogEntry[] {
    let filtered = [...this._logs];

    if (filter.level) {
      filtered = filtered.filter(log => log.level === filter.level);
    }
    if (filter.category) {
      filtered = filtered.filter(log => log.category === filter.category);
    }
    if (filter.startTime) {
      filtered = filtered.filter(log => log.timestamp >= filter.startTime!);
    }
    if (filter.endTime) {
      filtered = filtered.filter(log => log.timestamp <= filter.endTime!);
    }
    if (filter.correlationId) {
      filtered = filtered.filter(log => log.correlationId === filter.correlationId);
    }
    if (filter.userId) {
      filtered = filtered.filter(log => log.userId === filter.userId);
    }
    if (filter.messagePattern) {
      const regex = new RegExp(filter.messagePattern, 'i');
      filtered = filtered.filter(log => regex.test(log.message));
    }
    if (filter.limit) {
      filtered = filtered.slice(0, filter.limit);
    }

    return filtered;
  }

  getMetrics(): MetricData[] {
    return [...this._metrics];
  }

  getFilteredMetrics(filter: MetricFilter): MetricData[] {
    let filtered = [...this._metrics];

    if (filter.name) {
      filtered = filtered.filter(metric => metric.name === filter.name);
    }
    if (filter.type) {
      filtered = filtered.filter(metric => metric.type === filter.type);
    }
    if (filter.startTime) {
      filtered = filtered.filter(metric => metric.timestamp >= filter.startTime!);
    }
    if (filter.endTime) {
      filtered = filtered.filter(metric => metric.timestamp <= filter.endTime!);
    }
    if (filter.labels) {
      filtered = filtered.filter(metric => {
        if (!metric.labels) return false;
        return Object.entries(filter.labels!).every(([key, value]) => metric.labels![key] === value);
      });
    }
    if (filter.limit) {
      filtered = filtered.slice(0, filter.limit);
    }

    return filtered;
  }

  getSpans(): TraceSpan[] {
    return Array.from(this._spans.values());
  }

  getFilteredSpans(filter: SpanFilter): TraceSpan[] {
    let filtered = Array.from(this._spans.values());

    if (filter.traceId) {
      filtered = filtered.filter(span => span.traceId === filter.traceId);
    }
    if (filter.operationName) {
      filtered = filtered.filter(span => span.operationName === filter.operationName);
    }
    if (filter.status) {
      filtered = filtered.filter(span => span.status === filter.status);
    }
    if (filter.startTime) {
      filtered = filtered.filter(span => span.startTime >= filter.startTime!);
    }
    if (filter.endTime) {
      filtered = filtered.filter(span => span.endTime && span.endTime <= filter.endTime!);
    }
    if (filter.minDuration) {
      filtered = filtered.filter(span => span.duration && span.duration >= filter.minDuration!);
    }
    if (filter.maxDuration) {
      filtered = filtered.filter(span => span.duration && span.duration <= filter.maxDuration!);
    }
    if (filter.limit) {
      filtered = filtered.slice(0, filter.limit);
    }

    return filtered;
  }

  clearLogs(): void {
    this._logs = [];
  }

  clearMetrics(): void {
    this._metrics = [];
  }

  clearSpans(): void {
    this._spans.clear();
  }

  clearCorrelationContexts(): void {
    this._correlationContexts.clear();
  }

  getHealthStatus(): MiddlewareHealthStatus {
    const checks: any[] = [];
    let score = 100;

    const loggingCheck = {
      name: 'logging',
      status: this._config.enableLogging ? 'pass' as const : 'warn' as const,
      message: this._config.enableLogging ? 'Logging enabled' : 'Logging disabled',
      duration: 0,
      timestamp: new Date(),
    };
    checks.push(loggingCheck);
    if (!this._config.enableLogging) score -= 10;

    const metricsCheck = {
      name: 'metrics',
      status: this._config.enableMetrics ? 'pass' as const : 'warn' as const,
      message: this._config.enableMetrics ? 'Metrics enabled' : 'Metrics disabled',
      duration: 0,
      timestamp: new Date(),
    };
    checks.push(metricsCheck);
    if (!this._config.enableMetrics) score -= 10;

    const tracingCheck = {
      name: 'tracing',
      status: this._config.enableTracing ? 'pass' as const : 'warn' as const,
      message: this._config.enableTracing ? 'Tracing enabled' : 'Tracing disabled',
      duration: 0,
      timestamp: new Date(),
    };
    checks.push(tracingCheck);
    if (!this._config.enableTracing) score -= 10;

    const correlationCheck = {
      name: 'correlation',
      status: this._config.enableCorrelation ? 'pass' as const : 'warn' as const,
      message: this._config.enableCorrelation ? 'Correlation enabled' : 'Correlation disabled',
      duration: 0,
      timestamp: new Date(),
    };
    checks.push(correlationCheck);
    if (!this._config.enableCorrelation) score -= 10;

    const status = score >= 80 ? 'healthy' as const : score >= 50 ? 'degraded' as const : 'unhealthy' as const;

    return {
      status,
      checks,
      score,
      lastCheck: new Date(),
    };
  }

  runDiagnostics(): MiddlewareDiagnostics {
    const traceId = this._generateId();
    const timestamp = new Date();
    const steps: any[] = [];
    let totalDuration = 0;

    const loggingStep = {
      name: 'logging',
      status: 'success' as const,
      duration: 1,
      message: 'Logging system operational',
      details: { enabled: this._config.enableLogging, level: this._config.logLevel },
    };
    steps.push(loggingStep);
    totalDuration += loggingStep.duration;

    const metricsStep = {
      name: 'metrics',
      status: 'success' as const,
      duration: 1,
      message: 'Metrics system operational',
      details: { enabled: this._config.enableMetrics, count: this._metrics.length },
    };
    steps.push(metricsStep);
    totalDuration += metricsStep.duration;

    const tracingStep = {
      name: 'tracing',
      status: 'success' as const,
      duration: 1,
      message: 'Tracing system operational',
      details: { enabled: this._config.enableTracing, spans: this._spans.size },
    };
    steps.push(tracingStep);
    totalDuration += tracingStep.duration;

    const correlationStep = {
      name: 'correlation',
      status: 'success' as const,
      duration: 1,
      message: 'Correlation system operational',
      details: { enabled: this._config.enableCorrelation, contexts: this._correlationContexts.size },
    };
    steps.push(correlationStep);
    totalDuration += correlationStep.duration;

    const summary = {
      totalSteps: steps.length,
      successfulSteps: steps.filter(s => s.status === 'success').length,
      failedSteps: steps.filter(s => s.status === 'error').length,
      warningSteps: steps.filter(s => s.status === 'warning').length,
      overallStatus: 'success' as const,
      totalDuration,
    };

    return {
      traceId,
      timestamp,
      steps,
      summary,
    };
  }

  getStatistics(): MiddlewareStatistics {
    this._statistics.uptime = Date.now() - this._startTime.getTime();
    return { ...this._statistics };
  }

  resetStatistics(): void {
    this._statistics = this._initializeStatistics();
    this._statistics.startTime = new Date();
  }

  aggregateLogs(filter?: LogFilter): LogAggregationResult {
    const logs = filter ? this.getFilteredLogs(filter) : this._logs;
    const count = logs.length;

    const byLevel: Record<LogLevel, number> = {} as Record<LogLevel, number>;
    const byCategory: Record<LogCategory, number> = {} as Record<LogCategory, number>;
    const messageCounts: Record<string, number> = {};
    const errors: LogEntry[] = [];

    logs.forEach(log => {
      byLevel[log.level] = (byLevel[log.level] || 0) + 1;
      if (log.category) {
        byCategory[log.category] = (byCategory[log.category] || 0) + 1;
      }
      messageCounts[log.message] = (messageCounts[log.message] || 0) + 1;
      if (log.level === LogLevel.ERROR || log.level === LogLevel.FATAL) {
        errors.push(log);
      }
    });

    const topMessages = Object.entries(messageCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([message, count]) => ({ message, count }));

    const timeRange = {
      start: logs.length > 0 ? logs[0].timestamp : new Date(),
      end: logs.length > 0 ? logs[logs.length - 1].timestamp : new Date(),
    };

    return {
      count,
      byLevel,
      byCategory,
      timeRange,
      topMessages,
      errors,
    };
  }

  aggregateMetrics(metricName: string, filter?: MetricFilter): MetricAggregationResult {
    const allMetrics = filter ? this.getFilteredMetrics(filter) : this._metrics;
    const metrics = allMetrics.filter(m => m.name === metricName);

    const statistics = this.getMetricStatistics(metricName);

    const timeRange = {
      start: metrics.length > 0 ? metrics[0].timestamp : new Date(),
      end: metrics.length > 0 ? metrics[metrics.length - 1].timestamp : new Date(),
    };

    const labels = metrics.length > 0 && metrics[0].labels ? metrics[0].labels : undefined;

    return {
      name: metricName,
      type: metrics.length > 0 ? metrics[0].type : 'COUNTER' as const,
      statistics,
      timeRange,
      labels,
    };
  }

  private _getLogLevelPriority(level: LogLevel): number {
    const priorities: Record<LogLevel, number> = {
      [LogLevel.TRACE]: 0,
      [LogLevel.DEBUG]: 1,
      [LogLevel.INFO]: 2,
      [LogLevel.WARN]: 3,
      [LogLevel.ERROR]: 4,
      [LogLevel.FATAL]: 5,
    };
    return priorities[level];
  }

  private _generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  private _createDummySpan(operationName: string): TraceSpan {
    return {
      traceId: 'dummy',
      spanId: 'dummy',
      operationName,
      startTime: new Date(),
      endTime: new Date(),
      duration: 0,
    };
  }

  private _createDummyContext(): CorrelationContext {
    return {
      correlationId: 'dummy',
      traceId: 'dummy',
      requestId: 'dummy',
    };
  }

  addPipeline(pipeline: MiddlewarePipeline): void {
    this._pipelines.set(pipeline.name, pipeline);
  }

  removePipeline(pipelineName: string): void {
    this._pipelines.delete(pipelineName);
  }

  getPipeline(pipelineName: string): MiddlewarePipeline | undefined {
    return this._pipelines.get(pipelineName);
  }

  getPipelines(): MiddlewarePipeline[] {
    return Array.from(this._pipelines.values());
  }

  addPipelineStage(pipelineName: string, stage: PipelineStage): void {
    const pipeline = this._pipelines.get(pipelineName);
    if (pipeline) {
      pipeline.stages.push(stage);
      pipeline.stages.sort((a, b) => a.order - b.order);
    }
  }

  removePipelineStage(pipelineName: string, stageName: string): void {
    const pipeline = this._pipelines.get(pipelineName);
    if (pipeline) {
      pipeline.stages = pipeline.stages.filter(s => s.name !== stageName);
    }
  }

  enablePipeline(pipelineName: string): void {
    const pipeline = this._pipelines.get(pipelineName);
    if (pipeline) {
      pipeline.enabled = true;
    }
  }

  disablePipeline(pipelineName: string): void {
    const pipeline = this._pipelines.get(pipelineName);
    if (pipeline) {
      pipeline.enabled = false;
    }
  }

  flushMetrics(): void {
    this._metrics = [];
  }

  flushLogs(): void {
    this._logs = [];
  }

  getCorrelationContextByRequestId(requestId: string): CorrelationContext | undefined {
    return this._correlationContexts.get(requestId);
  }

  getSpanById(spanId: string): TraceSpan | undefined {
    return this._spans.get(spanId);
  }

  getSpansByTraceId(traceId: string): TraceSpan[] {
    return Array.from(this._spans.values()).filter(span => span.traceId === traceId);
  }
}
