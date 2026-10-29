/**
 * W3C Trace Context
 *
 * Implementation of the `traceparent` header format defined by the W3C
 * Trace Context recommendation:
 *
 *   traceparent = version "-" trace-id "-" parent-id "-" trace-flags
 *   version     = 2 hex digits        (00)
 *   trace-id    = 32 hex digits       (16 bytes)
 *   parent-id   = 16 hex digits       (8 bytes)
 *   trace-flags = 2 hex digits        (bit 0 = sampled)
 *
 * Also supports `tracestate` round-tripping as an opaque vendor string.
 *
 * @module DistributedTracingLayer/Engine
 */

export interface TraceContext {
  /** 32-char lowercase hex trace id. */
  readonly traceId: string;
  /** 16-char lowercase hex span id (the "parent id" field on the wire). */
  readonly parentId: string;
  /** Sampling flag (bit 0 of trace-flags). */
  readonly sampled: boolean;
  /** Full trace-flags byte (other bits reserved by spec). */
  readonly traceFlags: number;
  /** Opaque `tracestate` value carried alongside, if any. */
  readonly traceState?: string;
  /** Version parsed from the header (currently always 0). */
  readonly version: number;
}

const VERSION_RE = /^[0-9a-f]{2}$/;
const TRACE_ID_RE = /^[0-9a-f]{32}$/;
const PARENT_ID_RE = /^[0-9a-f]{16}$/;
const FLAGS_RE = /^[0-9a-f]{2}$/;

/** All-zero ids are explicitly invalid per the spec. */
const ZERO_TRACE = '0'.repeat(32);
const ZERO_PARENT = '0'.repeat(16);

export class TraceContextParseError extends Error {
  readonly header: string;
  constructor(header: string, reason: string) {
    super(`invalid traceparent: ${reason}`);
    this.name = 'TraceContextParseError';
    this.header = header;
  }
}

/**
 * Parse a `traceparent` header. Strict per spec:
 *  - exactly 4 dash-separated fields
 *  - lowercase hex only (uppercase is rejected)
 *  - all-zero trace/parent ids rejected
 *  - version `ff` rejected (reserved for future, must not error silently)
 *
 * @throws TraceContextParseError on malformed input.
 */
export function parseTraceparent(header: string): TraceContext {
  if (typeof header !== 'string' || header.length === 0) {
    throw new TraceContextParseError(header, 'empty header');
  }
  const parts = header.split('-');
  if (parts.length !== 4) {
    throw new TraceContextParseError(header, `expected 4 fields, got ${parts.length}`);
  }
  const [version, traceId, parentId, flags] = parts;
  if (!VERSION_RE.test(version)) {
    throw new TraceContextParseError(header, `bad version "${version}"`);
  }
  if (version === 'ff') {
    throw new TraceContextParseError(header, 'version ff is forbidden');
  }
  if (!TRACE_ID_RE.test(traceId)) {
    throw new TraceContextParseError(header, `bad trace-id "${traceId}"`);
  }
  if (traceId === ZERO_TRACE) {
    throw new TraceContextParseError(header, 'trace-id must not be all zeros');
  }
  if (!PARENT_ID_RE.test(parentId)) {
    throw new TraceContextParseError(header, `bad parent-id "${parentId}"`);
  }
  if (parentId === ZERO_PARENT) {
    throw new TraceContextParseError(header, 'parent-id must not be all zeros');
  }
  if (!FLAGS_RE.test(flags)) {
    throw new TraceContextParseError(header, `bad trace-flags "${flags}"`);
  }
  const flagByte = parseInt(flags, 16);
  return {
    traceId,
    parentId,
    sampled: (flagByte & 0x01) !== 0,
    traceFlags: flagByte,
    version: parseInt(version, 16),
  };
}

/**
 * Lenient parse — returns `undefined` instead of throwing. Used when
 * extracting context from untrusted inbound requests where a malformed
 * header should start a *new* trace rather than fail the request.
 */
export function tryParseTraceparent(header: string | undefined | null): TraceContext | undefined {
  if (!header) return undefined;
  try {
    return parseTraceparent(header);
  } catch {
    return undefined;
  }
}

/** Serialize a context to the canonical `traceparent` header value. */
export function buildTraceparent(ctx: Pick<TraceContext, 'traceId' | 'parentId' | 'sampled'>): string {
  const flags = ctx.sampled ? '01' : '00';
  return `00-${ctx.traceId}-${ctx.parentId}-${flags}`;
}

/**
 * Derive a child context for an outbound call: same trace id, the new
 * span id becomes the parent-id field, sampling flag is inherited.
 */
export function childContext(ctx: TraceContext, childSpanId: string): TraceContext {
  return {
    traceId: ctx.traceId,
    parentId: childSpanId,
    sampled: ctx.sampled,
    traceFlags: ctx.traceFlags,
    traceState: ctx.traceState,
    version: 0,
  };
}

/** Hex id generator (not cryptographic — spans need uniqueness, not secrecy). */
export function randomHexId(bytes: number): string {
  const chars = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < bytes * 2; i++) {
    out += chars[Math.floor(Math.random() * 16)];
  }
  return out;
}

export function generateTraceId(): string {
  // Ensure non-zero per spec.
  let id = randomHexId(16);
  while (id === ZERO_TRACE) id = randomHexId(16);
  return id;
}

export function generateSpanId(): string {
  let id = randomHexId(8);
  while (id === ZERO_PARENT) id = randomHexId(8);
  return id;
}
