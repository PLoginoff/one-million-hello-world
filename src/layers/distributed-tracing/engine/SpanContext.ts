/**
 * Async-boundary context propagation (AsyncLocalStorage stub).
 *
 * Holds the "current span" across logical async scopes. This is a
 * hand-rolled, explicit-stack variant of `AsyncLocalStorage`: it gives
 * the same API surface (`run`, `getStore`) but scoping is driven by the
 * caller's `run()` wrapper rather than V8 async resources — which keeps
 * the engine dependency-free and deterministic in tests.
 *
 * For Node deployments, swap the internals for `AsyncLocalStorage`
 * without changing the call sites: the contract is identical.
 *
 * @module DistributedTracingLayer/Engine
 */

import { TraceContext } from './trace-context';

/** The propagated unit: the ambient trace context plus the active span id. */
export interface ActiveSpanContext {
  readonly traceId: string;
  readonly spanId: string;
  readonly sampled: boolean;
  /** Baggage propagated alongside trace context (W3C `baggage` header). */
  readonly baggage: Readonly<Record<string, string>>;
}

/**
 * Explicit-scope context storage. Mirrors `AsyncLocalStorage`'s API:
 *   storage.run(value, () => ...)   — value is current inside the callback
 *   storage.getStore()              — current value or undefined
 *   storage.runAsync(value, async () => ...)
 */
export class ScopeStorage<T> {
  private _stack: T[] = [];

  getStore(): T | undefined {
    return this._stack[this._stack.length - 1];
  }

  run<R>(value: T, fn: () => R): R {
    this._stack.push(value);
    try {
      return fn();
    } finally {
      this._stack.pop();
    }
  }

  async runAsync<R>(value: T, fn: () => Promise<R>): Promise<R> {
    this._stack.push(value);
    try {
      return await fn();
    } finally {
      this._stack.pop();
    }
  }

  /** Escape the current scope: run `fn` with no ambient context. */
  exit<R>(fn: () => R): R {
    const popped = this._stack.pop();
    try {
      return fn();
    } finally {
      if (popped !== undefined) this._stack.push(popped);
    }
  }

  depth(): number {
    return this._stack.length;
  }
}

/**
 * Propagation API layered on `ScopeStorage` for trace contexts.
 * A singleton is exported for convenience; tests construct their own.
 */
export class ContextPropagator {
  readonly storage = new ScopeStorage<ActiveSpanContext>();

  /** The currently-active context, if any. */
  active(): ActiveSpanContext | undefined {
    return this.storage.getStore();
  }

  /** Activate `ctx` for the duration of `fn`. */
  activate<T>(ctx: ActiveSpanContext, fn: () => T): T {
    return this.storage.run(ctx, fn);
  }

  async activateAsync<T>(ctx: ActiveSpanContext, fn: () => Promise<T>): Promise<T> {
    return this.storage.runAsync(ctx, fn);
  }

  /**
   * Inject the active context into an outbound carrier (HTTP headers,
   * message metadata, etc.) using `traceparent` + `baggage`.
   */
  inject(carrier: Record<string, string>, ctx?: ActiveSpanContext): void {
    const active = ctx ?? this.active();
    if (!active) return;
    carrier['traceparent'] = `00-${active.traceId}-${active.spanId}-${active.sampled ? '01' : '00'}`;
    const entries = Object.entries(active.baggage);
    if (entries.length > 0) {
      carrier['baggage'] = entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join(', ');
    }
  }

  /** Extract an `ActiveSpanContext` from an inbound carrier. */
  extract(carrier: Record<string, string>): ActiveSpanContext | undefined {
    const tp = carrier['traceparent'];
    if (!tp) return undefined;
    const parts = tp.split('-');
    if (parts.length !== 4) return undefined;
    const [, traceId, spanId, flags] = parts;
    const baggage: Record<string, string> = {};
    const bag = carrier['baggage'];
    if (bag) {
      for (const pair of bag.split(',')) {
        const eq = pair.indexOf('=');
        if (eq > 0) baggage[pair.slice(0, eq).trim()] = decodeURIComponent(pair.slice(eq + 1).trim());
      }
    }
    return {
      traceId,
      spanId,
      sampled: (parseInt(flags, 16) & 1) !== 0,
      baggage,
    };
  }

  /**
   * Produce a *child* context: the caller's new span id becomes the
   * parent-id on the wire, baggage is inherited.
   */
  childOf(ctx: ActiveSpanContext | TraceContext, newSpanId: string): ActiveSpanContext {
    const baggage = 'baggage' in ctx ? ctx.baggage : {};
    return {
      traceId: ctx.traceId,
      spanId: newSpanId,
      sampled: ctx.sampled,
      baggage,
    };
  }
}
