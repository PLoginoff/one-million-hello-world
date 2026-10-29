/**
 * Correlation Envelope
 *
 * Trace-context propagation across telemetry signals. Every signal that
 * passes through the pipeline is wrapped (conceptually) in an envelope
 * carrying:
 *   - traceId / spanId   — W3C trace context
 *   - baggage            — free-form key/value propagated downstream
 *   - origin             — which component produced the signal
 *
 * The `CorrelationContext` class is a minimal async-context holder: an
 * explicit stack (`push`/`pop`/`run`) plus `runAsync` that keeps the
 * context around for a promise's lifetime. This is a stub for real
 * `AsyncLocalStorage` semantics — the contract is the same, but the
 * caller controls scoping explicitly, which keeps the engine
 * dependency-free and fully deterministic in tests.
 *
 * @module ObservabilityLayer/Engine
 */

import { Attributes, TelemetrySignal } from './signals';

/** Immutable snapshot of the correlation data stamped onto signals. */
export interface CorrelationSnapshot {
  readonly traceId: string;
  readonly spanId: string;
  readonly baggage: Readonly<Record<string, string>>;
  readonly sampled: boolean;
}

/** 16-byte trace id / 8-byte span id generators (hex, lowercase). */
export function randomHex(bytes: number): string {
  let out = '';
  for (let i = 0; i < bytes * 2; i++) {
    out += '0123456789abcdef'[Math.floor(Math.random() * 16)];
  }
  return out;
}

export function newTraceId(): string {
  return randomHex(16);
}

export function newSpanId(): string {
  return randomHex(8);
}

/**
 * Explicit-stack correlation context. `run`/`push`/`pop` provide lexical
 * scoping; `runAsync` attaches the context for the duration of an async
 * function.
 *
 * Usage:
 *   ctx.run({ traceId, spanId, baggage: {}, sampled: true }, () => {
 *     router.ingest(log);          // stamped automatically
 *   });
 */
export class CorrelationContext {
  private _stack: CorrelationSnapshot[] = [];

  current(): CorrelationSnapshot | undefined {
    return this._stack[this._stack.length - 1];
  }

  depth(): number {
    return this._stack.length;
  }

  push(snapshot: CorrelationSnapshot): void {
    this._stack.push(snapshot);
  }

  pop(): CorrelationSnapshot | undefined {
    return this._stack.pop();
  }

  run<T>(snapshot: CorrelationSnapshot, fn: () => T): T {
    this.push(snapshot);
    try {
      return fn();
    } finally {
      this.pop();
    }
  }

  async runAsync<T>(snapshot: CorrelationSnapshot, fn: () => Promise<T>): Promise<T> {
    this.push(snapshot);
    try {
      return await fn();
    } finally {
      this.pop();
    }
  }

  /**
   * Stamp the current correlation onto a signal (non-destructive: the
   * signal keeps any explicit ids it already carries).
   */
  apply(signal: TelemetrySignal): TelemetrySignal {
    const cur = this.current();
    if (!cur) return signal;
    const mutable = signal as { traceId?: string; spanId?: string; attributes: Attributes };
    if (mutable.traceId === undefined) mutable.traceId = cur.traceId;
    if (mutable.spanId === undefined) mutable.spanId = cur.spanId;
    if (Object.keys(cur.baggage).length > 0) {
      mutable.attributes = { ...mutable.attributes, ...this._baggageAttrs(cur.baggage) };
    }
    return signal;
  }

  private _baggageAttrs(baggage: Readonly<Record<string, string>>): Attributes {
    const out: Attributes = {};
    for (const [k, v] of Object.entries(baggage)) {
      out[`baggage.${k}`] = v;
    }
    return out;
  }
}

/** Parse a W3C `baggage` header value ("k1=v1, k2=v2") into a record. */
export function parseBaggage(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of header.split(',')) {
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const k = pair.slice(0, eq).trim();
    const v = pair.slice(eq + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

/** Serialize baggage back to a header value. */
export function formatBaggage(baggage: Readonly<Record<string, string>>): string {
  return Object.entries(baggage)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join(', ');
}
