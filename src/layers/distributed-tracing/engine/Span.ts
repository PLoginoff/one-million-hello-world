/**
 * Span — the mutable, in-flight representation of one operation.
 *
 * A span records start/end timestamps, a kind (client/server/internal/
 * producer/consumer), a status, a set of timestamped events and a flat
 * attribute map. Once `end()` is called the span freezes into an
 * immutable `SpanSnapshot` that flows through the processor pipeline.
 *
 * Clock-skew correction: `SpanTree.correctClockSkew()` clamps child
 * timestamps into their parent's bounds — needed when services on
 * different hosts emit spans whose clocks disagree.
 *
 * @module DistributedTracingLayer/Engine
 */

import { buildTraceparent, childContext, generateSpanId, generateTraceId, TraceContext } from './trace-context';

export type SpanKind = 'internal' | 'server' | 'client' | 'producer' | 'consumer';
export type SpanStatusCode = 'UNSET' | 'OK' | 'ERROR';

export interface SpanStatus {
  readonly code: SpanStatusCode;
  /** Error description — required by convention when code === 'ERROR'. */
  readonly message?: string;
}

/** A timestamped annotation on a span (e.g. "exception", "retry", "message.sent"). */
export interface SpanEvent {
  readonly name: string;
  readonly timestampMs: number;
  readonly attributes: Readonly<Record<string, string | number | boolean>>;
}

export type SpanAttributeValue = string | number | boolean;

export interface SpanSnapshot {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly name: string;
  readonly kind: SpanKind;
  readonly startTimeMs: number;
  readonly endTimeMs: number;
  readonly status: SpanStatus;
  readonly attributes: Readonly<Record<string, SpanAttributeValue>>;
  readonly events: ReadonlyArray<SpanEvent>;
  readonly droppedAttributesCount: number;
  readonly droppedEventsCount: number;
}

const STATUS_EXCEPTION_EVENT = 'exception';
const DEFAULT_ATTR_LIMIT = 128;
const DEFAULT_EVENT_LIMIT = 128;

export interface SpanOptions {
  readonly kind?: SpanKind;
  readonly attributes?: Record<string, SpanAttributeValue>;
  readonly startTimeMs?: number;
  /** Limits keep a misbehaving instrumentation point from bloating memory. */
  readonly attributeLimit?: number;
  readonly eventLimit?: number;
}

/**
 * Mutable span. All mutation methods no-op after `end()`. Exposed
 * through the `Tracer` API; rarely constructed directly.
 */
export class Span {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly name: string;
  readonly kind: SpanKind;
  readonly startTimeMs: number;

  private _endTimeMs: number | undefined;
  private _status: SpanStatus = { code: 'UNSET' };
  private _attributes: Record<string, SpanAttributeValue>;
  private _events: SpanEvent[] = [];
  private _droppedAttrs = 0;
  private _droppedEvents = 0;
  private readonly _attrLimit: number;
  private readonly _eventLimit: number;
  private readonly _clock: () => number;

  constructor(
    name: string,
    traceId: string,
    spanId: string,
    parentSpanId: string | undefined,
    clock: () => number,
    options: SpanOptions = {}
  ) {
    this.name = name;
    this.traceId = traceId;
    this.spanId = spanId;
    this.parentSpanId = parentSpanId;
    this.kind = options.kind ?? 'internal';
    this._clock = clock;
    this.startTimeMs = options.startTimeMs ?? clock();
    this._attributes = { ...(options.attributes ?? {}) };
    this._attrLimit = options.attributeLimit ?? DEFAULT_ATTR_LIMIT;
    this._eventLimit = options.eventLimit ?? DEFAULT_EVENT_LIMIT;
  }

  get ended(): boolean {
    return this._endTimeMs !== undefined;
  }

  /** Set/replace an attribute. Silently drops beyond the attribute limit. */
  setAttribute(key: string, value: SpanAttributeValue): this {
    if (this.ended) return this;
    if (!(key in this._attributes) && Object.keys(this._attributes).length >= this._attrLimit) {
      this._droppedAttrs++;
      return this;
    }
    this._attributes[key] = value;
    return this;
  }

  setAttributes(attrs: Record<string, SpanAttributeValue>): this {
    for (const [k, v] of Object.entries(attrs)) this.setAttribute(k, v);
    return this;
  }

  /** Append a timestamped event. */
  addEvent(name: string, attributes: Record<string, SpanAttributeValue> = {}, timestampMs?: number): this {
    if (this.ended) return this;
    if (this._events.length >= this._eventLimit) {
      this._droppedEvents++;
      return this;
    }
    this._events.push({ name, timestampMs: timestampMs ?? this._clock(), attributes });
    return this;
  }

  /** Record an exception as an `exception` event + ERROR status. */
  recordException(err: unknown, timestampMs?: number): this {
    if (this.ended) return this;
    const message = err instanceof Error ? err.message : String(err);
    const name = err instanceof Error ? err.name : 'Error';
    this.addEvent(STATUS_EXCEPTION_EVENT, {
      'exception.type': name,
      'exception.message': message,
      ...(err instanceof Error && err.stack ? { 'exception.stacktrace': err.stack } : {}),
    }, timestampMs);
    this.setStatus('ERROR', message);
    return this;
  }

  setStatus(code: SpanStatusCode, message?: string): this {
    if (this.ended) return this;
    // Once ERROR is set, only another ERROR can overwrite (spec behaviour).
    if (this._status.code === 'ERROR' && code !== 'ERROR') return this;
    this._status = { code, message };
    return this;
  }

  /** Freeze the span. `endTimeMs` defaults to the injected clock. */
  end(endTimeMs?: number): SpanSnapshot {
    if (this.ended) return this.snapshot();
    this._endTimeMs = endTimeMs ?? this._clock();
    return this.snapshot();
  }

  /** Immutable copy of the current span state. */
  snapshot(): SpanSnapshot {
    return {
      traceId: this.traceId,
      spanId: this.spanId,
      parentSpanId: this.parentSpanId,
      name: this.name,
      kind: this.kind,
      startTimeMs: this.startTimeMs,
      endTimeMs: this._endTimeMs ?? this._clock(),
      status: this._status,
      attributes: { ...this._attributes },
      events: [...this._events],
      droppedAttributesCount: this._droppedAttrs,
      droppedEventsCount: this._droppedEvents,
    };
  }

  /** Build a `traceparent` header representing *this* span as the parent. */
  toTraceparent(): string {
    return buildTraceparent({ traceId: this.traceId, parentId: this.spanId, sampled: true });
  }
}

/**
 * A span tree reconstructs parent/child relationships from snapshots and
 * provides clock-skew correction. Constructed lazily by `TraceBuilder`.
 */
export class SpanTree {
  readonly roots: SpanSnapshot[] = [];
  private readonly _children: Map<string, SpanSnapshot[]> = new Map();
  private readonly _byId: Map<string, SpanSnapshot> = new Map();

  constructor(spans: ReadonlyArray<SpanSnapshot>) {
    for (const s of spans) this._byId.set(s.spanId, s);
    for (const s of spans) {
      if (s.parentSpanId && this._byId.has(s.parentSpanId)) {
        const list = this._children.get(s.parentSpanId) ?? [];
        list.push(s);
        this._children.set(s.parentSpanId, list);
      } else {
        this.roots.push(s);
      }
    }
    for (const list of this._children.values()) {
      list.sort((a, b) => a.startTimeMs - b.startTimeMs);
    }
    this.roots.sort((a, b) => a.startTimeMs - b.startTimeMs);
  }

  childrenOf(spanId: string): ReadonlyArray<SpanSnapshot> {
    return this._children.get(spanId) ?? [];
  }

  parentOf(spanId: string): SpanSnapshot | undefined {
    const s = this._byId.get(spanId);
    return s?.parentSpanId ? this._byId.get(s.parentSpanId) : undefined;
  }

  /**
   * Clock-skew correction pass.
   *
   * When a child's timestamps fall outside its parent's interval (remote
   * clock ahead/behind), we clamp the child into the parent's bounds
   * while preserving the child's *duration*. If duration is longer than
   * the parent's, the child spans the whole parent interval.
   *
   * Runs bottom-up: parents are corrected first via their own parents,
   * then children clamp against the corrected parent interval.
   * Complexity: O(n) — each span visited once.
   */
  correctClockSkew(): SpanSnapshot[] {
    const corrected = new Map<string, SpanSnapshot>();

    const visit = (span: SpanSnapshot): SpanSnapshot => {
      const cached = corrected.get(span.spanId);
      if (cached) return cached;

      let out = span;
      const parent = span.parentSpanId ? this._byId.get(span.parentSpanId) : undefined;
      if (parent) {
        const p = visit(parent); // ensure parent corrected first
        out = clampToParent(span, p);
      }
      corrected.set(span.spanId, out);
      return out;
    };

    // Depth-first traversal from roots covers every reachable span.
    const result: SpanSnapshot[] = [];
    const walk = (s: SpanSnapshot) => {
      const c = visit(s);
      result.push(c);
      for (const child of this._children.get(s.spanId) ?? []) walk(child);
    };
    for (const r of this.roots) walk(r);
    // Orphaned spans (parent id references a span not in this trace) are
    // included as-is so nothing is silently dropped.
    for (const s of this._byId.values()) {
      if (!corrected.has(s.spanId)) result.push(s);
    }
    return result;
  }
}

/**
 * Clamp a child into its parent's [start, end] window, preserving
 * duration when possible.
 */
export function clampToParent(child: SpanSnapshot, parent: SpanSnapshot): SpanSnapshot {
  const parentStart = parent.startTimeMs;
  const parentEnd = Math.max(parent.endTimeMs, parent.startTimeMs);
  let start = child.startTimeMs;
  let end = child.endTimeMs;
  const duration = Math.max(0, end - start);

  if (start >= parentStart && end <= parentEnd) return child; // already inside

  const parentDuration = Math.max(0, parentEnd - parentStart);
  if (duration >= parentDuration) {
    // Child longer than the parent: pin to the whole parent interval.
    start = parentStart;
    end = parentEnd;
  } else {
    if (start < parentStart) {
      start = parentStart;
      end = start + duration;
    }
    if (end > parentEnd) {
      end = parentEnd;
      start = end - duration;
    }
    // Re-check the lower bound after shifting.
    if (start < parentStart) {
      start = parentStart;
      end = Math.min(start + duration, parentEnd);
    }
  }
  if (start === child.startTimeMs && end === child.endTimeMs) return child;
  return { ...child, startTimeMs: start, endTimeMs: end };
}

/** Options for starting a span via `Tracer`. */
export interface StartSpanOptions extends SpanOptions {
  /** Explicit parent — otherwise the current context is consulted. */
  readonly parent?: { traceId: string; spanId: string; sampled?: boolean };
  readonly traceId?: string;
}

/**
 * The tracer mints spans, links them into traces, and notifies a
 * processor pipeline on `end()`.
 */
export class Tracer {
  private readonly _clock: () => number;
  private readonly _onEnd: (snapshot: SpanSnapshot) => void;
  private readonly _serviceName: string;

  constructor(
    serviceName: string,
    clock: () => number,
    onEnd: (snapshot: SpanSnapshot) => void
  ) {
    this._serviceName = serviceName;
    this._clock = clock;
    this._onEnd = onEnd;
  }

  startSpan(name: string, options: StartSpanOptions = {}): Span {
    const parent = options.parent;
    const traceId = options.traceId ?? parent?.traceId ?? generateTraceId();
    const span = new Span(name, traceId, generateSpanId(), parent?.spanId, this._clock, options);
    span.setAttribute('service.name', this._serviceName);
    return span;
  }

  /** Start a span from an inbound `traceparent` (server/producer continuation). */
  startSpanFromContext(name: string, inbound: TraceContext | undefined, options: StartSpanOptions = {}): Span {
    const parent = inbound
      ? { traceId: inbound.traceId, spanId: inbound.parentId, sampled: inbound.sampled }
      : options.parent;
    return this.startSpan(name, { ...options, parent });
  }

  /** End a span and push its snapshot through the processor. */
  endSpan(span: Span, endTimeMs?: number): SpanSnapshot {
    const snap = span.end(endTimeMs);
    this._onEnd(snap);
    return snap;
  }

  /** Convenience: run `fn` inside a span, recording exceptions. */
  async withSpan<T>(name: string, options: StartSpanOptions, fn: (span: Span) => Promise<T>): Promise<T> {
    const span = this.startSpan(name, options);
    try {
      const result = await fn(span);
      if (span.snapshot().status.code === 'UNSET') span.setStatus('OK');
      return result;
    } catch (err) {
      span.recordException(err);
      throw err;
    } finally {
      this.endSpan(span);
    }
  }

  /** Derive the outgoing context for propagating *from* `span`. */
  outgoingContext(span: Span): TraceContext {
    return childContext(
      { traceId: span.traceId, parentId: span.spanId, sampled: true, traceFlags: 1, version: 0 },
      span.spanId
    );
  }
}
