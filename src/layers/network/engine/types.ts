/**
 * Network Engine — shared types.
 *
 * Vocabulary:
 * - `PooledConnectionFactory` — creates/validates/destroys pooled
 *   connections; the pool never constructs sockets itself.
 * - `ConnectionPool`           — warm pool with idle eviction and
 *   lifetime caps; checkout/checkin are O(1).
 * - `BackpressureController`   — write-side credit gate implementing
 *   high/low watermark hysteresis over a `ByteSink`-shaped writer.
 * - `TlsTermination`           — pure state machine modelling a TLS
 *   handshake; consumes opaque TLS records, emits alerts/appdata.
 * - `Http2FrameCodec`          — incremental encoder/decoder for the
 *   HTTP/2 frame layer (RFC 7540 §4.1, §6).
 * - `KeepAliveTracker`         — per-connection reuse/pipelining stats
 *   enforcing `maxRequests` and idle deadlines.
 *
 * All time is read through an injectable `EngineClock` so every
 * component is deterministic under test.
 *
 * @module NetworkLayer/Engine
 */

import { NetworkError } from '../utils/NetworkError';

/* ------------------------------------------------------------------ */
/* Clock                                                               */
/* ------------------------------------------------------------------ */

/** Monotonic clock; `now()` is milliseconds since an arbitrary epoch. */
export interface EngineClock {
  now(): number;
}

export class SystemEngineClock implements EngineClock {
  now(): number {
    return Date.now();
  }
}

/** Deterministic clock for tests — `advance` is explicit. */
export class ManualEngineClock implements EngineClock {
  private _t = 0;
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

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export class PoolExhaustedError extends NetworkError {
  constructor(waiting: number, maxSize: number) {
    super(
      'POOL_EXHAUSTED',
      `Connection pool exhausted: ${waiting} waiters, max size ${maxSize}`,
      503
    );
    this.name = 'PoolExhaustedError';
  }
}

export class PoolClosedError extends NetworkError {
  constructor() {
    super('POOL_CLOSED', 'Connection pool is closed', 410);
    this.name = 'PoolClosedError';
  }
}

export class AcquireTimeoutError extends NetworkError {
  constructor(timeoutMs: number) {
    super('ACQUIRE_TIMEOUT', `Timed out acquiring connection after ${timeoutMs}ms`, 504);
    this.name = 'AcquireTimeoutError';
  }
}

export class TlsHandshakeError extends NetworkError {
  constructor(state: string, detail: string) {
    super('TLS_HANDSHAKE', `TLS handshake failed in state ${state}: ${detail}`, 400);
    this.name = 'TlsHandshakeError';
  }
}

export class Http2ProtocolError extends NetworkError {
  readonly streamId: number;
  constructor(code: string, message: string, streamId = 0) {
    super(code, message, 500);
    this.name = 'Http2ProtocolError';
    this.streamId = streamId;
  }
}

export class FrameSizeError extends Http2ProtocolError {
  constructor(length: number, max: number, streamId: number) {
    super(
      'FRAME_SIZE_ERROR',
      `Frame length ${length} exceeds max frame size ${max}`,
      streamId
    );
    this.name = 'FrameSizeError';
  }
}

/* ------------------------------------------------------------------ */
/* Byte sink (write side)                                              */
/* ------------------------------------------------------------------ */

/**
 * Minimal writable-socket contract used by the backpressure
 * controller: `write` returns `false` when the kernel buffer is full
 * and the caller must wait for {@link onDrain} — the Node stream
 * contract distilled.
 */
export interface ByteSink {
  write(chunk: Uint8Array): boolean;
  flush?(): void;
  end?(): void;
  onDrain?(cb: () => void): void;
  readonly closed: boolean;
}

/* ------------------------------------------------------------------ */
/* Connection pool                                                     */
/* ------------------------------------------------------------------ */

/** Opaque connection handle pooled by {@link ConnectionPool}. */
export interface PooledConnection {
  /** Unique id assigned by the factory. */
  readonly id: string;
}

/**
 * Lifecycle hooks the pool delegates connection construction,
 * validation and teardown to. All methods may be sync or async.
 */
export interface PooledConnectionFactory<T extends PooledConnection> {
  /** Create a fresh connection. Called during warm-up and on demand. */
  create(): Promise<T> | T;
  /** Health check run before handing an idle connection out. */
  validate?(conn: T): Promise<boolean> | boolean;
  /** Graceful close (idle eviction, lifetime cap, pool shutdown). */
  destroy(conn: T): Promise<void> | void;
}

export interface ConnectionPoolOptions {
  /** Minimum idle connections kept warm. */
  readonly minIdle?: number;
  /** Hard cap on total connections (idle + checked out). */
  readonly maxSize?: number;
  /** Ms a connection may sit idle before eviction. 0 = never. */
  readonly idleTimeoutMs?: number;
  /** Ms a connection may live (from creation) before it is retired. */
  readonly maxLifetimeMs?: number;
  /** Ms an `acquire` may wait for a connection before rejecting. */
  readonly acquireTimeoutMs?: number;
  /** Re-validate idle connections before checkout. Default true. */
  readonly validateOnCheckout?: boolean;
  /** Injectable clock. */
  readonly clock?: EngineClock;
}

export interface PoolStatsSnapshot {
  readonly idle: number;
  readonly checkedOut: number;
  readonly pending: number;
  readonly waiters: number;
  readonly totalCreated: number;
  readonly totalDestroyed: number;
  readonly totalAcquired: number;
  readonly totalReleased: number;
  readonly evictedIdle: number;
  readonly evictedLifetime: number;
  readonly failedValidations: number;
  readonly acquireTimeouts: number;
}

/* ------------------------------------------------------------------ */
/* Backpressure                                                        */
/* ------------------------------------------------------------------ */

export interface BackpressureOptions {
  /** Bytes at which writers are asked to pause. */
  readonly highWaterMark: number;
  /** Bytes below which a paused writer resumes + drain fires. */
  readonly lowWaterMark: number;
  /** Hard cap on queued bytes; enqueue throws when exceeded. */
  readonly maxQueuedBytes?: number;
}

export interface BackpressureWriteResult {
  /** True when the caller should pause (queued >= highWaterMark). */
  readonly backpressured: boolean;
  /** Bytes currently queued (post-operation). */
  readonly queuedBytes: number;
  /** Resolves when this chunk's bytes reached the sink. */
  readonly flushed: Promise<void>;
}

/* ------------------------------------------------------------------ */
/* TLS termination stub                                                */
/* ------------------------------------------------------------------ */

/**
 * States of the TLS 1.3-ish handshake state machine. The stub models
 * the *sequence* of the handshake (record types, expected ordering)
 * without doing any cryptography — it exists so the pipeline can
 * reason about "is this connection mid-handshake" and "how many
 * records did the client send before completing".
 */
export const enum TlsState {
  /** No records seen yet. */
  START = 'START',
  /** ClientHello consumed. */
  CLIENT_HELLO = 'CLIENT_HELLO',
  /** ServerHello + Certificate + Finished emitted. */
  SERVER_FLIGHT = 'SERVER_FLIGHT',
  /** Handshake complete; application data flows. */
  ESTABLISHED = 'ESTABLISHED',
  /** Handshake aborted via alert. */
  FAILED = 'FAILED',
  /** Connection closed after established. */
  CLOSED = 'CLOSED',
}

/**
 * TLS record-layer content types (RFC 8446 §5.1). Only the ones the
 * stub cares about are enumerated; unknown values fail the record.
 */
export const enum TlsContentType {
  CHANGE_CIPHER_SPEC = 20,
  ALERT = 21,
  HANDSHAKE = 22,
  APPLICATION_DATA = 23,
}

/** Handshake message types (RFC 8446 §4) the stub understands. */
export const enum TlsHandshakeType {
  CLIENT_HELLO = 1,
  SERVER_HELLO = 2,
  NEW_SESSION_TICKET = 4,
  END_OF_EARLY_DATA = 5,
  ENCRYPTED_EXTENSIONS = 8,
  CERTIFICATE = 11,
  CERTIFICATE_VERIFY = 15,
  FINISHED = 20,
  KEY_UPDATE = 24,
}

/** A decoded TLS record handed to the state machine. */
export interface TlsRecord {
  readonly contentType: TlsContentType | number;
  /** Protocol version field from the record header (e.g. 0x0303). */
  readonly version: number;
  /** Record payload (still encrypted once established — opaque here). */
  readonly fragment: Uint8Array;
}

export interface TlsHandshakeEvent {
  readonly state: TlsState;
  /** Handshake message type observed, when the record was HANDSHAKE. */
  readonly handshakeType?: number;
  /** Alert description byte when an alert terminated the handshake. */
  readonly alert?: number;
}

export interface TlsTerminationOptions {
  /** Max records before completing the handshake (DoS guard). */
  readonly maxHandshakeRecords?: number;
  /** Max ms allowed from START to ESTABLISHED. */
  readonly handshakeTimeoutMs?: number;
  /** Injectable clock. */
  readonly clock?: EngineClock;
}

/* ------------------------------------------------------------------ */
/* HTTP/2 framing                                                      */
/* ------------------------------------------------------------------ */

/** Frame type codes (RFC 7540 §6). */
export const enum Http2FrameType {
  DATA = 0x0,
  HEADERS = 0x1,
  PRIORITY = 0x2,
  RST_STREAM = 0x3,
  SETTINGS = 0x4,
  PUSH_PROMISE = 0x5,
  PING = 0x6,
  GOAWAY = 0x7,
  WINDOW_UPDATE = 0x8,
  CONTINUATION = 0x9,
}

/** Flag bits shared across frame types. */
export const enum Http2Flag {
  END_STREAM = 0x1,
  ACK = 0x1,
  END_HEADERS = 0x4,
  PADDED = 0x8,
  PRIORITY = 0x20,
}

/** Decoded 9-byte frame header + opaque payload. */
export interface Http2Frame {
  /** 24-bit payload length. */
  readonly length: number;
  readonly type: Http2FrameType | number;
  readonly flags: number;
  /** 31-bit stream identifier (0 = connection-level). */
  readonly streamId: number;
  readonly payload: Uint8Array;
}

export interface Http2CodecOptions {
  /** Largest accepted payload; inbound oversize → FRAME_SIZE_ERROR. */
  readonly maxFrameSize?: number;
  /** True for a server endpoint (stream-id parity checks). */
  readonly server?: boolean;
}

/** Flow-control window bookkeeping for one stream or the connection. */
export interface FlowControlWindow {
  /** Current available credit in octets. */
  readonly available: number;
  /** Initial window configured at open. */
  readonly initial: number;
}

export interface WindowUpdateResult {
  /** Credit actually applied (clamped to 2^31-1 ceiling). */
  readonly applied: number;
  /** Available credit after the update. */
  readonly available: number;
}

/* ------------------------------------------------------------------ */
/* Keep-alive / pipelining                                             */
/* ------------------------------------------------------------------ */

export interface KeepAliveOptions {
  /** Max requests served on one connection before close. */
  readonly maxRequests?: number;
  /** Ms of inactivity before the connection is considered stale. */
  readonly idleTimeoutMs?: number;
  /** Max in-flight pipelined requests before throttling. */
  readonly maxPipelineDepth?: number;
  /** Injectable clock. */
  readonly clock?: EngineClock;
}

export interface KeepAliveVerdict {
  /** Whether the connection may serve another request. */
  readonly reusable: boolean;
  /** Requests served so far. */
  readonly requestsServed: number;
  /** Currently in-flight (pipelined) requests. */
  readonly inFlight: number;
  /** Ms until the connection is stale; Infinity when idle timeout off. */
  readonly staleInMs: number;
  /** Reason the connection is not reusable, when applicable. */
  readonly reason?: 'max-requests' | 'idle-timeout' | 'closed';
}
