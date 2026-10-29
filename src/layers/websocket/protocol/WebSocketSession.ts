/**
 * WebSocketSession — a logical RFC 6455 connection endpoint.
 *
 * The session is transport-agnostic: bytes arrive via `receiveData()`
 * and bytes to send are handed to the `TransportSink` callback. A real
 * deployment wires it to a `net.Socket`; tests wire it to an array.
 *
 * Responsibilities:
 *  - Drive {@link FrameCodec} and {@link MessageReassembler}.
 *  - Automatic PONG replies to PING (§5.5.2: "MUST be sent as soon as
 *    practical" — we do it synchronously on receipt).
 *  - Ping/pong keepalive with a configurable timeout: if no pong for a
 *    sent ping arrives within `pongTimeoutMs`, the connection is failed.
 *  - Close handshake state machine (§7): sending or receiving CLOSE moves
 *    to CLOSING; both directions exchanged (or transport ended) → CLOSED.
 *  - Outbound message queue with `bufferedAmount` tracking for
 *    backpressure — mirrors the browser API so producers can pause.
 *
 * @module WebsocketLayer/Protocol
 */

import { FrameCodec } from './FrameCodec';
import { MessageReassembler, ReassemblerEvent } from './MessageReassembler';
import {
  BackpressureStats,
  WsCloseBody,
  WsCloseCode,
  WsFrame,
  WsMessage,
  WsOpcode,
  WsProtocolError,
  WsSessionState,
} from './types';

/** Transport abstraction: a synchronous byte sink (socket.write). */
export type TransportSink = (bytes: Buffer) => void;

/** Session lifecycle/data listener bundle. */
export interface SessionListeners {
  /** Complete application message received (after reassembly). */
  readonly onMessage?: (message: WsMessage) => void;
  /** Pong received — `rttMs` is set when it answers a pending keepalive ping. */
  readonly onPong?: (body: Buffer, rttMs: number | null) => void;
  /** Close frame received (session has already replied if needed). */
  readonly onClose?: (close: WsCloseBody) => void;
  /** State transition notification. */
  readonly onStateChange?: (state: WsSessionState) => void;
  /** Protocol/violation errors — session has already sent its close. */
  readonly onError?: (error: WsProtocolError) => void;
  /** Message dropped by the backpressure policy. */
  readonly onDrop?: (payload: Buffer, reason: string) => void;
}

export interface SessionOptions {
  /** True if this endpoint is a server (incoming frames must be masked). */
  readonly isServer?: boolean;
  /** Sink for outbound bytes. */
  readonly transport: TransportSink;
  /** Queue high-water mark in bytes. Default 1 MiB. */
  readonly highWaterMark?: number;
  /** Max queued bytes before messages are dropped outright. Default 4 MiB. */
  readonly maxQueueBytes?: number;
  /** Interval between keepalive pings; 0 disables keepalive. Default 0. */
  readonly pingIntervalMs?: number;
  /** Max wait for a pong before failing the connection. Default 10s. */
  readonly pongTimeoutMs?: number;
  /** Max reassembled message size. Default 16 MiB. */
  readonly maxMessageBytes?: number;
  /** Injectable clock for deterministic tests. */
  readonly now?: () => number;
  /** Injectable scheduler (setTimeout-like); inject for tests. */
  readonly setTimeoutFn?: (fn: () => void, ms: number) => unknown;
  readonly clearTimeoutFn?: (handle: unknown) => void;
}

interface QueuedMessage {
  /** Serialized wire bytes (frames already encoded). */
  readonly bytes: Buffer;
  /** Monotonic enqueue timestamp. */
  readonly enqueuedAt: number;
}

const DEFAULT_HIGH_WATER = 1024 * 1024; // 1 MiB
const DEFAULT_MAX_QUEUE = 4 * 1024 * 1024; // 4 MiB
const DEFAULT_PONG_TIMEOUT = 10_000;

export class WebSocketSession {
  private readonly _isServer: boolean;
  private readonly _transport: TransportSink;
  private readonly _highWater: number;
  private readonly _maxQueue: number;
  private readonly _pingInterval: number;
  private readonly _pongTimeout: number;
  private readonly _now: () => number;
  private readonly _setTimeout: (fn: () => void, ms: number) => unknown;
  private readonly _clearTimeout: (handle: unknown) => void;

  private readonly _codec: FrameCodec;
  private readonly _reassembler: MessageReassembler;
  private readonly _listeners: SessionListeners;

  private _state: WsSessionState = WsSessionState.CONNECTING;
  private _queue: QueuedMessage[] = [];
  private _bufferedAmount = 0;
  private _totalBytesSent = 0;
  private _droppedMessages = 0;

  /** Keepalive bookkeeping. */
  private _pingTimer: unknown = null;
  private _pongTimer: unknown = null;
  private _awaitingPong = false;
  private _lastPingAt = 0;
  private _closeSentCode: number | null = null;
  private _closeReceived = false;

  constructor(options: SessionOptions, listeners: SessionListeners = {}) {
    this._isServer = options.isServer ?? false;
    this._transport = options.transport;
    this._highWater = options.highWaterMark ?? DEFAULT_HIGH_WATER;
    this._maxQueue = options.maxQueueBytes ?? DEFAULT_MAX_QUEUE;
    this._pingInterval = options.pingIntervalMs ?? 0;
    this._pongTimeout = options.pongTimeoutMs ?? DEFAULT_PONG_TIMEOUT;
    this._now = options.now ?? (() => Date.now());
    this._setTimeout = options.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
    this._clearTimeout = options.clearTimeoutFn ?? ((h) => clearTimeout(h as NodeJS.Timeout));
    this._listeners = listeners;

    this._codec = new FrameCodec({ requireMask: this._isServer });
    this._reassembler = new MessageReassembler({ maxMessageBytes: options.maxMessageBytes });
  }

  get state(): WsSessionState {
    return this._state;
  }

  get bufferedAmount(): number {
    return this._bufferedAmount;
  }

  get queuedMessages(): number {
    return this._queue.length;
  }

  /** Mark the handshake complete and transition to OPEN. */
  open(): void {
    if (this._state !== WsSessionState.CONNECTING) {
      throw new WsProtocolError(`Cannot open session in state ${this._state}`);
    }
    this._setState(WsSessionState.OPEN);
    if (this._pingInterval > 0) {
      this._scheduleNextPing();
    }
  }

  /**
   * Feed inbound bytes from the transport. Decodes all complete frames,
   * reassembles messages, answers pings, drives the close handshake.
   * Protocol violations trigger a protocol close (and `onError`).
   */
  receiveData(chunk: Buffer): void {
    if (this._isClosed()) return;
    try {
      const frames = this._codec.feed(chunk);
      for (const frame of frames) {
        this._dispatchFrame(frame);
        // Re-check via method: `_dispatchFrame` may transition to CLOSED,
        // and TS narrowing on `this._state` doesn't account for that.
        if (this._isClosed()) break;
      }
    } catch (err) {
      const error =
        err instanceof WsProtocolError
          ? err
          : new WsProtocolError(err instanceof Error ? err.message : String(err));
      this._failConnection(error);
    }
  }

  /**
   * Send a complete application message. Serialized immediately so the
   * queued bytes reflect true wire size; the queue models the TCP send
   * buffer for backpressure purposes.
   *
   * @returns true if accepted, false if dropped by backpressure policy.
   */
  sendMessage(payload: Buffer | string, binary = false): boolean {
    if (this._state !== WsSessionState.OPEN) return false;
    const data = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload;
    const opcode = binary ? WsOpcode.BINARY : WsOpcode.TEXT;
    const frame = FrameCodec.encode(opcode, data, { mask: !this._isServer });
    return this._enqueue(frame);
  }

  /**
   * Flush queued messages to the transport. In this in-memory model the
   * transport is synchronous, so `flush()` drains the whole queue; a real
   * socket adapter would call this on `drain` events.
   */
  flush(): void {
    while (this._queue.length > 0) {
      const msg = this._queue.shift() as QueuedMessage;
      this._transport(msg.bytes);
      this._bufferedAmount -= msg.bytes.byteLength;
      this._totalBytesSent += msg.bytes.byteLength;
    }
  }

  /** Send a protocol-level ping immediately (not through the queue). */
  ping(body: Buffer = Buffer.alloc(0)): void {
    if (this._state !== WsSessionState.OPEN) return;
    this._lastPingAt = this._now();
    this._awaitingPong = true;
    this._transport(FrameCodec.encodePing(body, !this._isServer));
    if (this._pongTimeout > 0) {
      this._armPongTimeout();
    }
  }

  /**
   * Initiate the close handshake (§7.1.2). Sends a CLOSE frame and moves
   * to CLOSING; the peer's CLOSE reply completes the handshake.
   */
  close(code: number = WsCloseCode.NORMAL, reason = ''): void {
    if (this._state === WsSessionState.CLOSED || this._state === WsSessionState.CLOSING) {
      return;
    }
    this._closeSentCode = code;
    try {
      this._transport(FrameCodec.encodeClose(code, reason, !this._isServer));
    } finally {
      this._setState(WsSessionState.CLOSING);
    }
    // If we've already received the peer's close, the handshake is done.
    if (this._closeReceived) {
      this._finishClose();
    }
  }

  /** The transport itself went away — treat as abnormal close (1006). */
  transportEnded(): void {
    if (this._state === WsSessionState.CLOSED) return;
    if (!this._closeReceived && this._closeSentCode === null) {
      this._listeners.onClose?.({ code: WsCloseCode.ABNORMAL, reason: 'transport ended' });
    }
    this._finishClose();
  }

  /** Current backpressure snapshot. */
  getBackpressureStats(): BackpressureStats {
    return {
      bufferedAmount: this._bufferedAmount,
      queuedMessages: this._queue.length,
      highWaterMark: this._highWater,
      overHighWaterMark: this._bufferedAmount >= this._highWater,
      totalBytesSent: this._totalBytesSent,
      droppedMessages: this._droppedMessages,
    };
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private _dispatchFrame(frame: WsFrame): void {
    const event = this._reassembler.push(frame);
    if (event === null) return;
    this._handleEvent(event);
  }

  private _handleEvent(event: ReassemblerEvent): void {
    switch (event.kind) {
      case 'message':
        if (this._state === WsSessionState.OPEN) {
          this._listeners.onMessage?.(event.message);
        }
        break;
      case 'ping':
        // §5.5.3: PONG MUST carry the identical body; respond immediately.
        if (this._state === WsSessionState.OPEN || this._state === WsSessionState.CLOSING) {
          this._transport(FrameCodec.encodePong(event.body, !this._isServer));
        }
        break;
      case 'pong': {
        const rtt = this._awaitingPong ? this._now() - this._lastPingAt : null;
        this._awaitingPong = false;
        this._disarmPongTimeout();
        this._listeners.onPong?.(event.body, rtt);
        break;
      }
      case 'close':
        this._closeReceived = true;
        this._listeners.onClose?.(event.close);
        if (this._state === WsSessionState.OPEN) {
          // Peer initiated; echo a close to complete the handshake.
          this._closeSentCode = event.close.code;
          this._transport(
            FrameCodec.encodeClose(event.close.code, '', !this._isServer)
          );
          this._setState(WsSessionState.CLOSING);
        }
        if (this._state === WsSessionState.CLOSING && this._closeSentCode !== null) {
          this._finishClose();
        }
        break;
    }
  }

  private _enqueue(bytes: Buffer): boolean {
    // Hard cap: drop rather than grow memory unboundedly.
    if (this._bufferedAmount + bytes.byteLength > this._maxQueue) {
      this._droppedMessages++;
      this._listeners.onDrop?.(bytes, 'max queue bytes exceeded');
      return false;
    }
    this._queue.push({ bytes, enqueuedAt: this._now() });
    this._bufferedAmount += bytes.byteLength;
    // Synchronous transport: flush eagerly unless over high water mark —
    // over-HWM queues are flushed too (the transport would buffer anyway),
    // but stats capture that we *were* over at send time.
    this.flush();
    return true;
  }

  private _failConnection(error: WsProtocolError): void {
    this._listeners.onError?.(error);
    // §7.1.7: send a close frame carrying the reason code, then consider
    // the connection failed (we do not wait for the peer's reply).
    if (this._state !== WsSessionState.CLOSED) {
      try {
        this._transport(FrameCodec.encodeClose(error.closeCode, '', !this._isServer));
      } catch {
        // Transport already broken — nothing left to do.
      }
      this._finishClose();
    }
  }

  private _finishClose(): void {
    this._disarmPongTimeout();
    if (this._pingTimer !== null) {
      this._clearTimeout(this._pingTimer);
      this._pingTimer = null;
    }
    this._setState(WsSessionState.CLOSED);
  }

  private _setState(state: WsSessionState): void {
    if (this._state === state) return;
    this._state = state;
    this._listeners.onStateChange?.(state);
  }

  /** Terminal-state check that defeats TS narrowing (state mutates in dispatch). */
  private _isClosed(): boolean {
    return this._state === WsSessionState.CLOSED;
  }

  private _scheduleNextPing(): void {
    this._pingTimer = this._setTimeout(() => {
      this._pingTimer = null;
      if (this._state !== WsSessionState.OPEN) return;
      this.ping();
      this._scheduleNextPing();
    }, this._pingInterval);
  }

  private _armPongTimeout(): void {
    this._disarmPongTimeout();
    this._pongTimer = this._setTimeout(() => {
      this._pongTimer = null;
      if (this._awaitingPong && this._state === WsSessionState.OPEN) {
        this._failConnection(new WsProtocolError('Pong timeout — peer unresponsive'));
      }
    }, this._pongTimeout);
  }

  private _disarmPongTimeout(): void {
    if (this._pongTimer !== null) {
      this._clearTimeout(this._pongTimer);
      this._pongTimer = null;
    }
  }
}
