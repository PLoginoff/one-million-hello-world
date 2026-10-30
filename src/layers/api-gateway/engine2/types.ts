/**
 * API Gateway Engine2 — Shared Types
 *
 * Second-generation gateway engine primitives: JSON body reshaping via a
 * JMESPath-like query language, multi-upstream response aggregation,
 * gateway-level tracing hooks, and per-consumer quota tracking.
 *
 * @module ApiGatewayLayer/Engine2
 */

/** Injectable clock for quota windows and tracing timestamps. */
export interface GatewayClock2 {
  now(): number;
}

export class SystemGatewayClock2 implements GatewayClock2 {
  now(): number {
    return Date.now();
  }
}

/** Test clock with manual time control. */
export class ManualGatewayClock2 implements GatewayClock2 {
  private _t: number;
  constructor(start: number = 0) {
    this._t = start;
  }
  now(): number {
    return this._t;
  }
  advance(ms: number): void {
    this._t += ms;
  }
  set(ms: number): void {
    this._t = ms;
  }
}

/**
 * A JSON value — the domain of the query language and body reshaper.
 * Defined structurally so callers can pass any parsed-JSON tree.
 */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

/** A JSON object (non-array, non-null). */
export type JsonObject = { [key: string]: JsonValue };

export function isJsonObject(v: JsonValue): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// ---------------------------------------------------------------------------
// Query language AST
// ---------------------------------------------------------------------------

/**
 * Parsed query AST. The grammar is a practical subset of JMESPath:
 *
 *   query     := subexpr ("|" subexpr)*
 *   subexpr   := primary ("." ident)*
 *   primary   := ident | index | "*" | "[]" | "[?cond]" | object-literal
 *   index     := "[" int "]"
 *   cond      := ident ("." ident)* cmp literal
 *   cmp       := "==" | "!=" | "<" | "<=" | ">" | ">="
 *   literal   := number | string | "true" | "false" | "null"
 *   object-lit:= "{" ident ":" query ("," ident ":" query)* "}"
 *
 * "[]" flattens one level of an array; "[?cond]" filters array elements;
 * object literals project computed values into a new object.
 */
export type QueryNode =
  | { readonly kind: 'identity' }
  | { readonly kind: 'field'; readonly name: string; readonly child: QueryNode }
  | { readonly kind: 'index'; readonly index: number; readonly child: QueryNode }
  | { readonly kind: 'wildcard'; readonly child: QueryNode }
  | { readonly kind: 'flatten'; readonly child: QueryNode }
  | {
      readonly kind: 'filter';
      readonly condition: FilterCondition;
      readonly child: QueryNode;
    }
  | {
      /**
       * Per-element projection: evaluate `source`, then map `child`
       * over each array element, dropping `undefined` results.
       * `items[*].price` parses to project(source=items[*], child=price).
       */
      readonly kind: 'project';
      readonly source: QueryNode;
      readonly child: QueryNode;
    }
  | {
      readonly kind: 'projection';
      readonly fields: ReadonlyArray<{ readonly name: string; readonly query: QueryNode }>;
    }
  | { readonly kind: 'pipe'; readonly left: QueryNode; readonly right: QueryNode }
  | { readonly kind: 'literal'; readonly value: JsonValue };

export type CompareOp = '==' | '!=' | '<' | '<=' | '>' | '>=';

export interface FilterCondition {
  /** Dotted path relative to each array element, e.g. `price` or `meta.sku`. */
  readonly path: readonly string[];
  readonly op: CompareOp;
  readonly value: JsonValue;
}

/** Error thrown when a query string fails to parse. */
export class QueryParseError extends Error {
  readonly position: number;
  constructor(message: string, position: number) {
    super(`QueryParseError at ${position}: ${message}`);
    this.name = 'QueryParseError';
    this.position = position;
  }
}

// ---------------------------------------------------------------------------
// Body reshaping
// ---------------------------------------------------------------------------

/** One transformation step applied to a request or response body. */
export interface ReshapeRule {
  /** Source path query selecting the value. */
  readonly from: string;
  /** Destination dotted path to write to. */
  readonly to: string;
  /** When the source yields `undefined`, fall back to this literal. */
  readonly defaultValue?: JsonValue;
  /** When true, drop the source path after copying (a move, not a copy). */
  readonly move?: boolean;
}

export interface ReshapeResult {
  readonly body: JsonValue;
  /** Paths that were dropped due to `move` semantics. */
  readonly moved: readonly string[];
  /** Rules whose source query produced `undefined`. */
  readonly missing: readonly string[];
}

// ---------------------------------------------------------------------------
// Response aggregation
// ---------------------------------------------------------------------------

/** One upstream callout to issue when aggregating. */
export interface AggregationTarget {
  readonly name: string;
  /** Under what key the response lands in the merged result. */
  readonly mergeKey: string;
  /** Timeout per target in ms; late arrivals degrade gracefully. */
  readonly timeoutMs?: number;
}

/** An upstream fetcher — resolves with the response JSON for a target. */
export type AggregationFetcher = (target: AggregationTarget) => Promise<JsonValue>;

export type MergeStrategy = 'deep' | 'shallow' | 'array-concat';

export interface AggregatedResult {
  readonly merged: JsonObject;
  /** Per-target outcomes — successes carry latency, failures carry error. */
  readonly outcomes: ReadonlyArray<AggregationOutcome>;
  /** True when at least one target failed or timed out. */
  readonly degraded: boolean;
}

export interface AggregationOutcome {
  readonly name: string;
  readonly ok: boolean;
  readonly latencyMs: number;
  readonly error?: string;
}

// ---------------------------------------------------------------------------
// Tracing
// ---------------------------------------------------------------------------

/** Span lifecycle hooks — implement to bridge to any tracing backend. */
export interface TracingHooks {
  /** Called when a span opens; return an opaque handle passed to end. */
  onSpanStart(span: SpanInfo): unknown;
  /** Called when a span closes. */
  onSpanEnd(span: CompletedSpan): void;
}

export interface SpanInfo {
  readonly name: string;
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly attributes: Readonly<Record<string, string | number | boolean>>;
  readonly startedAt: number;
}

export interface CompletedSpan extends SpanInfo {
  readonly endedAt: number;
  readonly durationMs: number;
  readonly status: 'ok' | 'error';
  readonly errorMessage?: string;
}

// ---------------------------------------------------------------------------
// Quotas
// ---------------------------------------------------------------------------

/** Quota window: fixed-size tumbling window aligned to Unix epoch. */
export interface QuotaPolicy {
  /** Max units a consumer may spend per window. */
  readonly limit: number;
  /** Window length in ms. */
  readonly windowMs: number;
  /** Cost granularity — minimum chargeable unit (default 1). */
  readonly unitSize?: number;
}

export interface QuotaCheck {
  readonly allowed: boolean;
  /** Units already spent in the current window (incl. this request). */
  readonly used: number;
  readonly limit: number;
  /** Unix ms when the current window rolls over. */
  readonly resetAt: number;
  /** Units remaining this window. */
  readonly remaining: number;
  /** When denied, ms until the consumer may retry. */
  readonly retryAfterMs?: number;
}
