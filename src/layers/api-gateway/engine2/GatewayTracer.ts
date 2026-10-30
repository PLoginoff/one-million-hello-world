/**
 * Gateway Tracer
 *
 * Lightweight span manager sitting in front of pluggable `TracingHooks`.
 * Maintains a parent-span stack per trace so nested gateway operations
 * (route match → transform → upstream call → aggregate) produce a proper
 * span tree rather than flat siblings.
 *
 * `run`/`runAsync` wrap a block in a span, propagate errors into the
 * span status, then rethrow — callers see the original exception.
 *
 * @module ApiGatewayLayer/Engine2
 */

import {
  CompletedSpan,
  GatewayClock2,
  SpanInfo,
  SystemGatewayClock2,
  TracingHooks,
} from './types';

export type SpanAttributes = Record<string, string | number | boolean>;

let counter = 0;

/** Cheap unique-id helper — not cryptographic, sufficient for span ids. */
function nextId(prefix: string): string {
  counter = (counter + 1) % 0xffffffff;
  return `${prefix}-${counter.toString(16).padStart(8, '0')}-${Date.now().toString(36)}`;
}

/** In-memory hooks useful for tests and log-based tracing. */
export class InMemoryTracingHooks implements TracingHooks {
  readonly completed: CompletedSpan[] = [];
  readonly started: SpanInfo[] = [];

  onSpanStart(span: SpanInfo): unknown {
    this.started.push(span);
    return span.spanId;
  }

  onSpanEnd(span: CompletedSpan): void {
    this.completed.push(span);
  }

  reset(): void {
    this.completed.length = 0;
    this.started.length = 0;
  }
}

/** A live span handle — call `end` or let `run*` close it. */
export class ActiveSpan {
  readonly info: SpanInfo;
  private readonly _tracer: GatewayTracer;
  private _ended = false;

  constructor(info: SpanInfo, tracer: GatewayTracer) {
    this.info = info;
    this._tracer = tracer;
  }

  end(status: 'ok' | 'error' = 'ok', errorMessage?: string): void {
    if (this._ended) return;
    this._ended = true;
    this._tracer.finishSpan(this, status, errorMessage);
  }
}

interface Frame {
  traceId: string;
  spanId: string;
}

export class GatewayTracer {
  private readonly _hooks: TracingHooks;
  private readonly _clock: GatewayClock2;
  private readonly _stack: Frame[] = [];
  private _activeTraceId: string | null = null;

  constructor(hooks: TracingHooks, clock?: GatewayClock2) {
    this._hooks = hooks;
    this._clock = clock ?? new SystemGatewayClock2();
  }

  /** Start a new root trace, or join the current one. */
  beginTrace(): string {
    this._activeTraceId = nextId('trace');
    return this._activeTraceId;
  }

  endTrace(): void {
    this._activeTraceId = null;
    this._stack.length = 0;
  }

  get currentTraceId(): string | null {
    return this._activeTraceId;
  }

  /** Open a span under the current parent (or as a root). */
  startSpan(name: string, attributes: SpanAttributes = {}): ActiveSpan {
    const traceId = this._activeTraceId ?? this.beginTrace();
    const parent = this._stack[this._stack.length - 1];
    const info: SpanInfo = {
      name,
      traceId,
      spanId: nextId('span'),
      parentSpanId: parent?.spanId,
      attributes,
      startedAt: this._clock.now(),
    };
    this._hooks.onSpanStart(info);
    this._stack.push({ traceId, spanId: info.spanId });
    return new ActiveSpan(info, this);
  }

  /** Internal — invoked by `ActiveSpan.end`. */
  finishSpan(span: ActiveSpan, status: 'ok' | 'error', errorMessage?: string): void {
    const top = this._stack[this._stack.length - 1];
    if (top && top.spanId === span.info.spanId) {
      this._stack.pop();
    } else {
      // Out-of-order end: remove wherever it sits to keep the stack sane.
      const idx = this._stack.findIndex((f) => f.spanId === span.info.spanId);
      if (idx >= 0) this._stack.splice(idx, 1);
    }
    const endedAt = this._clock.now();
    const completed: CompletedSpan = {
      ...span.info,
      endedAt,
      durationMs: endedAt - span.info.startedAt,
      status,
      errorMessage,
    };
    this._hooks.onSpanEnd(completed);
  }

  /**
   * Run `fn` inside a span. The span ends `ok` on return and `error`
   * (with the exception message recorded) on throw; the exception
   * propagates unchanged.
   */
  run<T>(name: string, attributes: SpanAttributes, fn: () => T): T {
    const span = this.startSpan(name, attributes);
    try {
      const result = fn();
      span.end('ok');
      return result;
    } catch (err) {
      span.end('error', err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  async runAsync<T>(name: string, attributes: SpanAttributes, fn: () => Promise<T>): Promise<T> {
    const span = this.startSpan(name, attributes);
    try {
      const result = await fn();
      span.end('ok');
      return result;
    } catch (err) {
      span.end('error', err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  get depth(): number {
    return this._stack.length;
  }
}
