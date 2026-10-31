/**
 * Controller Engine — Streaming Types
 *
 * Transport-free primitives for request streaming, multipart responses,
 * server-sent events, long-polling, and controller lifecycle/DI.
 *
 * These are intentionally shaped like web streams but *synchronous* —
 * a controller engine needs to be testable without a real HTTP socket.
 * Producers `write()` into a bounded buffer; consumers `read()` or
 * `drain()`. Backpressure is expressed by `write()` returning a
 * `WriteResult` instead of silently queueing.
 *
 * @module ControllerLayer/Engine
 */

// ---------------------------------------------------------------------------
// Backpressure-aware byte stream
// ---------------------------------------------------------------------------

/** Result of a `write()` into a bounded stream. */
export type WriteResult =
  | { readonly kind: 'accepted'; readonly buffered: number }
  | { readonly kind: 'full'; readonly buffered: number; readonly capacity: number }
  | { readonly kind: 'closed' };

/** Consumer-side view of a bounded chunk stream. */
export interface ChunkReader {
  /** Read at most `n` bytes; returns [] when drained + closed. */
  read(n: number): Uint8Array[];
  /** Read everything currently buffered. */
  drain(): Uint8Array[];
  /** Bytes currently buffered. */
  readonly buffered: number;
  /** Whether the producer has closed the stream. */
  readonly closed: boolean;
  /** Register a callback fired when the stream closes. */
  onClose(fn: () => void): void;
}

/** Producer-side view of a bounded chunk stream. */
export interface ChunkWriter {
  /**
   * Enqueue bytes. Returns `{kind:'full'}` when the buffer is at
   * capacity — the caller must drain or wait; nothing is dropped.
   */
  write(chunk: Uint8Array): WriteResult;
  /** Signal end-of-stream. Consumers see `closed` after draining. */
  close(): void;
  /** Capacity in bytes. */
  readonly capacity: number;
  /** Bytes currently buffered. */
  readonly buffered: number;
}

// ---------------------------------------------------------------------------
// Request streaming
// ---------------------------------------------------------------------------

/** One parsed request body chunk (after transfer-decoding). */
export interface BodyChunk {
  readonly data: Uint8Array;
  /** Sequence index. */
  readonly index: number;
  /** Bytes consumed so far *including* this chunk. */
  readonly cumulativeBytes: number;
}

/** Stats reported at end-of-stream. */
export interface StreamStats {
  readonly chunks: number;
  readonly totalBytes: number;
  readonly backpressureEvents: number;
  readonly durationMs: number;
}

/** Streaming request body processor. */
export interface RequestStream {
  /** Feed a chunk through the backpressure gate. */
  push(chunk: Uint8Array): WriteResult;
  /** Consume pending chunks (handler-driven pull). */
  pull(maxChunks?: number): BodyChunk[];
  /** Signal end-of-body. */
  finish(): void;
  /** Stats snapshot. */
  stats(): StreamStats;
  /** Whether finish() has been called. */
  readonly finished: boolean;
}

// ---------------------------------------------------------------------------
// Multipart response
// ---------------------------------------------------------------------------

/** One part in a multipart/mixed response. */
export interface MultipartPart {
  /** Part Content-Type (e.g. `application/json`). */
  readonly contentType: string;
  /** Part body — text or bytes. */
  readonly body: string | Uint8Array;
  /** Optional Content-Disposition (`attachment; filename="x"`). */
  readonly contentDisposition?: string;
  /** Optional per-part headers. */
  readonly headers?: Record<string, string>;
}

/** Serialized multipart response. */
export interface MultipartResponse {
  readonly contentType: string;
  readonly boundary: string;
  readonly body: Uint8Array;
  readonly partCount: number;
}

// ---------------------------------------------------------------------------
// Server-sent events
// ---------------------------------------------------------------------------

/** One SSE event frame. */
export interface ServerSentEvent {
  /** Event name (`message` when omitted). */
  readonly event?: string;
  /** Payload — serialized verbatim, `\n`-split lines become multi-`data:`. */
  readonly data: string;
  /** Event id (drives `Last-Event-ID` resumption). */
  readonly id?: string;
  /** Reconnection delay hint (ms). */
  readonly retry?: number;
  /** Comment-only frame (keeps connections alive). */
  readonly comment?: string;
}

/** Encoded SSE wire output for a batch of events. */
export interface SseFrame {
  readonly bytes: Uint8Array;
  readonly eventCount: number;
}

// ---------------------------------------------------------------------------
// Long-polling
// ---------------------------------------------------------------------------

/** Outcome of a long-poll wait. */
export type LongPollOutcome<T> =
  | { readonly kind: 'resolved'; readonly value: T; readonly waitedMs: number }
  | { readonly kind: 'timeout'; readonly waitedMs: number };

/** A deferred response handle — resolves when data arrives or times out. */
export interface Deferred<T> {
  readonly promise: Promise<LongPollOutcome<T>>;
  resolve(value: T): void;
  cancel(): void;
}

// ---------------------------------------------------------------------------
// Controller lifecycle
// ---------------------------------------------------------------------------

/** Dependency-injection token (symbol or string). */
export type DiToken = string | symbol;

/** Injectable contract — implementers wire their own deps. */
export interface ControllerLifecycle {
  /** Called once before first dispatch. */
  init?(ctx: ControllerRequestContext): Promise<void> | void;
  /** Called on shutdown — release resources. */
  dispose?(ctx: ControllerRequestContext): Promise<void> | void;
  /** Called before each request handling. */
  beforeRequest?(ctx: ControllerRequestContext): Promise<void> | void;
  /** Called after each request handling (success or error). */
  afterRequest?(ctx: ControllerRequestContext): Promise<void> | void;
}

/** Per-request context handed to lifecycle hooks + handlers.
 * Named `ControllerRequestContext` to avoid colliding with the
 * pre-existing `ControllerContext` in `types/controller-types`. */
export interface ControllerRequestContext {
  /** Request path. */
  readonly path: string;
  /** Correlation id. */
  readonly correlationId: string;
  /** Free-form state bag shared across hooks. */
  readonly state: Record<string, unknown>;
  /** Service-locator view of injected deps. */
  resolve<T>(token: DiToken): T;
}

/** Controller descriptor for the lifecycle-aware dispatcher. */
export interface LifecycleController {
  readonly lifecycle?: ControllerLifecycle;
  handle(ctx: ControllerRequestContext): Promise<unknown>;
}
