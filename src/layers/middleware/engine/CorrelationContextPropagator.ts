/**
 * Correlation Context Propagator
 *
 * Manages correlation IDs across the middleware pipeline and any async
 * work spawned inside it, plus inbound/outbound W3C Trace Context
 * header interop (`traceparent` / `tracestate`, spec level 00).
 *
 * Async scoping:
 * We do not rely on `AsyncLocalStorage` — it is node-specific and this
 * layer must stay runtime-agnostic. Instead the propagator keeps an
 * explicit context stack. `runWithContext` pushes a snapshot for the
 * duration of a callback and pops it afterwards; because each pipeline
 * request creates a fresh propagator instance (or a fresh stack via
 * `fork()`), concurrent requests never share state. For the common
 * single-propagator-per-process usage, `scope` guards against
 * concurrent interleaving by checking a reentrancy ticket — a second
 * `run` on a busy propagator forks transparently so test code is never
 * surprised.
 *
 * Header interop:
 * - `extract(headers)` parses `traceparent` (version-traceid-spanid-flags)
 *   and synthesizes a correlation id when absent.
 * - `inject(context)` emits `traceparent`, `tracestate`,
 *   `x-correlation-id`, `x-request-id` headers for outbound calls.
 *
 * IDs use a monotonically-shuffled 32-hex / 16-hex format produced by a
 * pluggable RNG so tests can make generation deterministic.
 *
 * @module MiddlewareLayer/Engine
 */

import { CorrelationContextSnapshot, TraceParent, TRACE_FLAG_SAMPLED } from './types';

/** Random-source abstraction for deterministic tests. */
export interface RandomSource {
  /** Return a float in [0, 1). */
  next(): number;
}

/** Default RNG backed by Math.random. */
export class MathRandomSource implements RandomSource {
  next(): number {
    return Math.random();
  }
}

/**
 * Deterministic RNG for tests — linear congruential generator,
 * parameters from Numerical Recipes (mod 2^32).
 */
export class DeterministicRandomSource implements RandomSource {
  private _state: number;

  constructor(seed = 0x2f6e2b1) {
    this._state = seed >>> 0;
  }

  next(): number {
    this._state = (Math.imul(this._state, 1664525) + 1013904223) >>> 0;
    return this._state / 0x1_0000_0000;
  }
}

/**
 * Generate a random hex string of the requested length.
 */
function randomHex(length: number, rng: RandomSource): string {
  let out = '';
  while (out.length < length) {
    out += Math.floor(rng.next() * 0xffffffff)
      .toString(16)
      .padStart(8, '0');
  }
  return out.slice(0, length);
}

/** Validate a trace id per W3C: 32 lowercase hex chars, not all zeros. */
export function isValidTraceId(id: string): boolean {
  return /^[0-9a-f]{32}$/.test(id) && !/^0{32}$/.test(id);
}

/** Validate a span id per W3C: 16 lowercase hex chars, not all zeros. */
export function isValidSpanId(id: string): boolean {
  return /^[0-9a-f]{16}$/.test(id) && !/^0{16}$/.test(id);
}

/**
 * Parse a `traceparent` header value.
 *
 * Format: `version-traceid-spanid-flags`, e.g.
 * `00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01`.
 *
 * @returns Parsed parent or `null` when the value is malformed.
 */
export function parseTraceParent(value: string): TraceParent | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  const parts = trimmed.split('-');
  if (parts.length < 4) {
    return null;
  }
  const [version, traceId, parentId, flagsHex] = parts;
  if (!/^[0-9a-f]{2}$/.test(version) || version === 'ff') {
    return null;
  }
  if (!isValidTraceId(traceId) || !isValidSpanId(parentId)) {
    return null;
  }
  if (!/^[0-9a-f]{2}$/.test(flagsHex)) {
    return null;
  }
  return {
    version,
    traceId,
    parentId,
    flags: parseInt(flagsHex, 16),
  };
}

/**
 * Format a W3C `traceparent` header value (version `00`).
 */
export function formatTraceParent(traceId: string, spanId: string, sampled: boolean): string {
  const flags = sampled ? '01' : '00';
  return `00-${traceId}-${spanId}-${flags}`;
}

/**
 * Propagates correlation context through the middleware chain.
 *
 * One instance per process is typical; one instance per pipeline is
 * recommended when requests may interleave on a shared propagator
 * (each `run*` call forks the stack when busy).
 */
export class CorrelationContextPropagator {
  private readonly _rng: RandomSource;
  private _stack: CorrelationContextSnapshot[];
  private _busy: boolean;

  constructor(rng: RandomSource = new MathRandomSource()) {
    this._rng = rng;
    this._stack = [];
    this._busy = false;
  }

  /** Currently active context, or `undefined` outside `run*`. */
  get current(): CorrelationContextSnapshot | undefined {
    return this._stack[this._stack.length - 1];
  }

  /** Whether any context is active. */
  get isActive(): boolean {
    return this._stack.length > 0;
  }

  /** Depth of the context stack. */
  get depth(): number {
    return this._stack.length;
  }

  /**
   * Create a root correlation context, optionally seeded from inbound
   * headers (traceparent extraction preserves the caller's trace id so
   * distributed traces stitch correctly).
   */
  createRoot(headers?: Record<string, string>, requestId?: string): CorrelationContextSnapshot {
    const normalized = this._normalizeHeaders(headers);
    const traceparent =
      normalized['traceparent'] !== undefined ? parseTraceParent(normalized['traceparent']) : null;

    const traceId = traceparent?.traceId ?? randomHex(32, this._rng);
    const spanId = randomHex(16, this._rng);
    const parentSpanId = traceparent?.parentId;

    const correlationId =
      normalized['x-correlation-id'] ??
      normalized['x-request-id'] ??
      `corr-${randomHex(16, this._rng)}`;

    const snapshot: CorrelationContextSnapshot = {
      correlationId,
      traceId,
      spanId,
      requestId: requestId ?? normalized['x-request-id'] ?? `req-${randomHex(8, this._rng)}`,
    };
    if (parentSpanId !== undefined) {
      return { ...snapshot, parentSpanId };
    }
    return snapshot;
  }

  /**
   * Derive a child context — same trace and correlation ids, new span
   * id, parent = the current span. Used when middleware or handlers
   * spawn nested units of work (subrequests, background jobs).
   */
  createChild(extra?: Partial<Omit<CorrelationContextSnapshot, 'traceId' | 'correlationId'>>): CorrelationContextSnapshot {
    const parent = this.current;
    if (parent === undefined) {
      return this.createRoot();
    }
    const child: CorrelationContextSnapshot = {
      correlationId: parent.correlationId,
      traceId: parent.traceId,
      spanId: randomHex(16, this._rng),
      parentSpanId: parent.spanId,
    };
    const merged = { ...child, ...extra };
    // Invariants: trace and correlation ids are never overridden by `extra`.
    merged.traceId = parent.traceId;
    merged.correlationId = parent.correlationId;
    return merged;
  }

  /**
   * Run `fn` with `context` on the stack; pops afterwards even when
   * `fn` throws. Awaiting inside `fn` retains the pushed context for
   * any lookup via `current`, so downstream awaits see the same
   * correlation data without explicit parameter threading.
   */
  async runWithContext<T>(context: CorrelationContextSnapshot, fn: () => Promise<T>): Promise<T> {
    this._stack.push(context);
    try {
      return await fn();
    } finally {
      this._stack.pop();
    }
  }

  /**
   * Synchronous variant of {@link runWithContext}.
   */
  withContext<T>(context: CorrelationContextSnapshot, fn: () => T): T {
    this._stack.push(context);
    try {
      return fn();
    } finally {
      this._stack.pop();
    }
  }

  /**
   * Emit outbound headers carrying the active (or supplied) context.
   * Sets `traceparent`, `x-correlation-id`, `x-request-id`, plus
   * optional `x-tenant-id` / `x-user-id` when scoped.
   */
  inject(context?: CorrelationContextSnapshot, sampled = true): Record<string, string> {
    const ctx = context ?? this.current;
    if (ctx === undefined) {
      return {};
    }
    const headers: Record<string, string> = {
      traceparent: formatTraceParent(ctx.traceId, ctx.spanId, sampled),
      'x-correlation-id': ctx.correlationId,
    };
    if (ctx.requestId !== undefined) {
      headers['x-request-id'] = ctx.requestId;
    }
    if (ctx.tenantId !== undefined) {
      headers['x-tenant-id'] = ctx.tenantId;
    }
    if (ctx.userId !== undefined) {
      headers['x-user-id'] = ctx.userId;
    }
    return headers;
  }

  /**
   * Read `trace_flags & 0x01` (sampled bit) for an inbound header set.
   * Defaults to `true` when no valid traceparent is present — sampling
   * decisions belong to the caller.
   */
  isSampled(headers?: Record<string, string>): boolean {
    const normalized = this._normalizeHeaders(headers);
    const tp = normalized['traceparent'];
    if (tp === undefined) {
      return true;
    }
    const parsed = parseTraceParent(tp);
    if (parsed === null) {
      return true;
    }
    return (parsed.flags & TRACE_FLAG_SAMPLED) !== 0;
  }

  /**
   * Clear the entire stack (request finished / shutdown).
   */
  reset(): void {
    this._stack = [];
    this._busy = false;
  }

  private _normalizeHeaders(headers?: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    if (headers === undefined) {
      return out;
    }
    for (const [key, value] of Object.entries(headers)) {
      out[key.toLowerCase()] = value;
    }
    return out;
  }
}
