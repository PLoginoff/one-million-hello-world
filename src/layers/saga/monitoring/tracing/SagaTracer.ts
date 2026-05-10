/**
 * Saga Tracer
 *
 * Distributed tracing for saga executions.
 * Provides detailed execution traces for debugging and observability.
 */

import { SagaExecutionEntity } from '../../domain/entities/SagaExecution';

export interface TraceSpan {
  spanId: string;
  parentSpanId?: string;
  operation: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  metadata?: Record<string, unknown>;
  tags?: Record<string, string>;
}

export interface Trace {
  traceId: string;
  executionId: string;
  spans: TraceSpan[];
  rootSpanId: string;
  startTime: number;
  endTime?: number;
}

export class SagaTracer {
  private readonly _traces: Map<string, Trace>;

  constructor() {
    this._traces = new Map();
  }

  /**
   * Start a new trace
   */
  startTrace(executionId: string): Trace {
    const traceId = `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const rootSpanId = `span_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const trace: Trace = {
      traceId,
      executionId,
      spans: [],
      rootSpanId,
      startTime: Date.now(),
    };

    const rootSpan: TraceSpan = {
      spanId: rootSpanId,
      operation: 'saga-execution',
      startTime: Date.now(),
      status: 'running',
    };

    trace.spans.push(rootSpan);
    this._traces.set(traceId, trace);

    return trace;
  }

  /**
   * Add a span
   */
  addSpan(traceId: string, operation: string, parentSpanId?: string, metadata?: Record<string, unknown>): TraceSpan {
    const trace = this._traces.get(traceId);
    if (!trace) {
      throw new Error(`Trace ${traceId} not found`);
    }

    const span: TraceSpan = {
      spanId: `span_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      parentSpanId,
      operation,
      startTime: Date.now(),
      status: 'running',
      metadata,
    };

    trace.spans.push(span);
    return span;
  }

  /**
   * Complete a span
   */
  completeSpan(traceId: string, spanId: string, status: 'completed' | 'failed' = 'completed'): void {
    const trace = this._traces.get(traceId);
    if (!trace) {
      throw new Error(`Trace ${traceId} not found`);
    }

    const span = trace.spans.find(s => s.spanId === spanId);
    if (!span) {
      throw new Error(`Span ${spanId} not found in trace ${traceId}`);
    }

    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.status = status;
  }

  /**
   * Complete a trace
   */
  completeTrace(traceId: string): void {
    const trace = this._traces.get(traceId);
    if (!trace) {
      throw new Error(`Trace ${traceId} not found`);
    }

    trace.endTime = Date.now();

    const rootSpan = trace.spans.find(s => s.spanId === trace.rootSpanId);
    if (rootSpan) {
      rootSpan.endTime = trace.endTime;
      rootSpan.duration = trace.endTime - rootSpan.startTime;
      rootSpan.status = 'completed';
    }
  }

  /**
   * Get trace by ID
   */
  getTrace(traceId: string): Trace | null {
    return this._traces.get(traceId) || null;
  }

  /**
   * Get trace by execution ID
   */
  getTraceByExecutionId(executionId: string): Trace | null {
    for (const trace of this._traces.values()) {
      if (trace.executionId === executionId) {
        return trace;
      }
    }
    return null;
  }

  /**
   * Get all traces
   */
  getAllTraces(): Trace[] {
    return Array.from(this._traces.values());
  }

  /**
   * Clear all traces
   */
  clear(): void {
    this._traces.clear();
  }
}
