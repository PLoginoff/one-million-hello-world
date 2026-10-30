/**
 * Http2Framing — incremental encoder/decoder for the HTTP/2 frame
 * layer (RFC 7540 §4.1) plus connection- and stream-level flow
 * control windows (§5.2, §6.9).
 *
 * Wire format: every frame is a 9-byte header —
 *   [u24 length][u8 type][u8 flags][u31 streamId] — followed by
 * `length` payload octets. The decoder is *incremental*: callers
 * `feed()` arbitrary TCP segmentations and drain whole frames via
 * `nextFrame()`; a partial frame simply waits for more bytes. This is
 * the only correct way to frame-parse over TCP — assuming one feed ==
 * one frame is the classic streaming bug.
 *
 * What the codec enforces (and what it deliberately doesn't):
 *  - 24-bit length vs `maxFrameSize` (default 16384, the RFC default)
 *    → `FrameSizeError` on oversize inbound frames.
 *  - Connection-level frames (SETTINGS, PING, GOAWAY) MUST have
 *    streamId 0; stream-level frames MUST NOT. Violations are
 *    `PROTOCOL_ERROR` per §5.1.1.
 *  - DATA frames subtract from both connection and per-stream flow
 *    control windows; WINDOW_UPDATE restores. Window ceiling is
 *    2^31-1 — exceeding it is `FLOW_CONTROL_ERROR`.
 *  - Header-block sequencing: a HEADERS frame without END_HEADERS
 *    must be followed by CONTINUATION frames on the *same* stream;
 *    interleaving anything else is `PROTOCOL_ERROR`.
 *
 * What it doesn't do: HPACK (header compression) — payloads are
 * opaque; that's the layer above. Stream lifecycle state (idle → open
 * → half-closed) is also above: this codec guards *wire* validity,
 * not stream semantics.
 *
 * Complexity: `feed` is O(bytes) for the buffer append; `nextFrame`
 * is O(1) amortized — a single growable byte buffer with a read
 * cursor, compacted only when the read cursor passes a threshold so
 * steady-state parsing doesn't copy.
 *
 * @module NetworkLayer/Engine
 */

import {
  FrameSizeError,
  Http2CodecOptions,
  Http2Flag,
  Http2Frame,
  Http2FrameType,
  Http2ProtocolError,
  WindowUpdateResult,
} from './types';

/** 9-byte frame header (RFC 7540 §4.1). */
export const HTTP2_HEADER_BYTES = 9;
/** Default SETTINGS_MAX_FRAME_SIZE: 2^14. */
export const HTTP2_DEFAULT_MAX_FRAME = 16_384;
/** Absolute protocol ceiling on frame size: 2^24-1. */
export const HTTP2_ABSOLUTE_MAX_FRAME = 16_777_215;
/** Flow-control window ceiling (RFC 7540 §6.9.1). */
export const HTTP2_MAX_WINDOW = 2_147_483_647;
/** Default connection + stream initial window: 65535. */
export const HTTP2_DEFAULT_WINDOW = 65_535;

/** Frame types that MUST appear on stream 0. */
const CONNECTION_LEVEL: ReadonlySet<number> = new Set([
  Http2FrameType.SETTINGS,
  Http2FrameType.PING,
  Http2FrameType.GOAWAY,
]);

/**
 * A single flow-control window: credit accounting with the 2^31-1
 * ceiling enforced on both inbound WINDOW_UPDATE handling and local
 * consumption.
 */
export class FlowWindow {
  private _available: number;
  private readonly _initial: number;

  constructor(initial: number = HTTP2_DEFAULT_WINDOW) {
    if (initial < 0 || initial > HTTP2_MAX_WINDOW) {
      throw new RangeError(`initial window ${initial} out of range`);
    }
    this._initial = initial;
    this._available = initial;
  }

  get available(): number {
    return this._available;
  }

  get initial(): number {
    return this._initial;
  }

  get exhausted(): boolean {
    return this._available <= 0;
  }

  /**
   * Consume `n` octets of credit (a DATA frame sent/received). Throws
   * `FLOW_CONTROL_ERROR` if the window would go negative — a peer
   * exceeding its credit is a protocol violation, not a clamp.
   */
  consume(n: number): number {
    if (n < 0) {
      throw new RangeError('consume amount must be >= 0');
    }
    if (n > this._available) {
      throw new Http2ProtocolError(
        'FLOW_CONTROL_ERROR',
        `flow-control window exceeded: tried to consume ${n}, have ${this._available}`
      );
    }
    this._available -= n;
    return this._available;
  }

  /**
   * Apply an inbound WINDOW_UPDATE increment. A 0 increment is a
   * protocol error on a stream (§6.9); exceeding 2^31-1 is
   * `FLOW_CONTROL_ERROR` regardless of scope.
   */
  applyWindowUpdate(increment: number, streamId: number): WindowUpdateResult {
    if (increment <= 0) {
      throw new Http2ProtocolError(
        'PROTOCOL_ERROR',
        'WINDOW_UPDATE increment must be > 0',
        streamId
      );
    }
    const next = this._available + increment;
    if (next > HTTP2_MAX_WINDOW) {
      throw new Http2ProtocolError(
        'FLOW_CONTROL_ERROR',
        `window would exceed ${HTTP2_MAX_WINDOW}`,
        streamId
      );
    }
    this._available = next;
    return { applied: increment, available: this._available };
  }

  /**
   * SETTINGS_INITIAL_WINDOW_SIZE delta handling (§6.9.2): adjusting
   * the *initial* window shifts every existing stream's available
   * credit by the delta — even negative, which is legal and simply
   * stalls the stream until WINDOW_UPDATEs catch up.
   */
  adjustInitial(delta: number): void {
    this._available += delta;
  }
}

export class Http2FrameCodec {
  private readonly _maxFrameSize: number;
  private readonly _server: boolean;

  /** Receive buffer: single array + read cursor (compacted lazily). */
  private _buf: number[];
  private _readIdx: number;

  /**
   * Header-block reassembly state: when a HEADERS frame arrives
   * without END_HEADERS, only CONTINUATION frames on the same stream
   * are legal until the block completes (§6.10).
   */
  private _continuationStream: number | null;

  /** Connection-level send window (frames we emit). */
  readonly connSendWindow: FlowWindow;
  /** Connection-level receive window (frames we accept). */
  readonly connRecvWindow: FlowWindow;
  /** Per-stream windows, created lazily on first stream contact. */
  private _streamWindows: Map<number, FlowWindow>;

  /** Stats for metrics. */
  private _framesDecoded: number;
  private _framesEncoded: number;
  private _bytesFed: number;

  constructor(options: Http2CodecOptions = {}) {
    this._maxFrameSize = options.maxFrameSize ?? HTTP2_DEFAULT_MAX_FRAME;
    this._server = options.server ?? false;

    if (this._maxFrameSize > HTTP2_ABSOLUTE_MAX_FRAME) {
      throw new RangeError(
        `maxFrameSize ${this._maxFrameSize} exceeds protocol ceiling`
      );
    }

    this._buf = [];
    this._readIdx = 0;
    this._continuationStream = null;
    this.connSendWindow = new FlowWindow();
    this.connRecvWindow = new FlowWindow();
    this._streamWindows = new Map();
    this._framesDecoded = 0;
    this._framesEncoded = 0;
    this._bytesFed = 0;
  }

  /* ---------------------------------------------------------------- */
  /* Decoding                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * Append inbound bytes to the parse buffer. Cheap O(n) push;
   * framing work happens in `nextFrame`.
   */
  feed(bytes: Uint8Array): void {
    for (let i = 0; i < bytes.byteLength; i++) {
      this._buf.push(bytes[i]);
    }
    this._bytesFed += bytes.byteLength;
  }

  /**
   * Pop the next complete frame, or `null` when the buffer holds only
   * a partial frame. Throws `Http2ProtocolError` on wire violations —
   * callers surface those as GOAWAY/RST at the layer above.
   */
  nextFrame(): Http2Frame | null {
    const buffered = this._buf.length - this._readIdx;
    if (buffered < HTTP2_HEADER_BYTES) {
      return null;
    }

    const b = this._buf;
    const i = this._readIdx;

    // [u24 length][u8 type][u8 flags][u31 streamId]
    const length = (b[i] << 16) | (b[i + 1] << 8) | b[i + 2];
    const type = b[i + 3];
    const flags = b[i + 4];
    const streamId =
      ((b[i + 5] & 0x7f) << 24) |
      (b[i + 6] << 16) |
      (b[i + 7] << 8) |
      b[i + 8];

    if (length > this._maxFrameSize) {
      throw new FrameSizeError(length, this._maxFrameSize, streamId);
    }
    if (buffered < HTTP2_HEADER_BYTES + length) {
      return null; // partial payload — wait for more bytes
    }

    const payload = new Uint8Array(length);
    for (let j = 0; j < length; j++) {
      payload[j] = b[i + HTTP2_HEADER_BYTES + j];
    }
    this._readIdx += HTTP2_HEADER_BYTES + length;

    // Compact when the consumed prefix is large: keeps steady-state
    // memory bounded without copying on every frame.
    if (this._readIdx >= 4096 && this._readIdx * 2 >= this._buf.length) {
      this._buf = this._buf.slice(this._readIdx);
      this._readIdx = 0;
    }

    const frame: Http2Frame = { length, type, flags, streamId, payload };
    this._validate(frame);
    this._framesDecoded++;
    return frame;
  }

  /**
   * Wire-validity checks that belong to the *frame* layer:
   *  - connection-level frames on stream 0 only;
   *  - stream-level frames never on stream 0;
   *  - CONTINUATION sequencing (§6.10);
   *  - DATA consumes receive-side flow control.
   */
  private _validate(frame: Http2Frame): void {
    const { type, streamId, flags, payload } = frame;

    if (CONNECTION_LEVEL.has(type) && streamId !== 0) {
      throw new Http2ProtocolError(
        'PROTOCOL_ERROR',
        `frame type ${type} requires stream id 0, got ${streamId}`,
        streamId
      );
    }
    // Stream-forbidden-on-0: WINDOW_UPDATE is dual-scope (§6.9: stream
    // 0 updates the connection window) so it's exempt; everything else
    // not in CONNECTION_LEVEL must carry a real stream id.
    if (
      !CONNECTION_LEVEL.has(type) &&
      type !== Http2FrameType.WINDOW_UPDATE &&
      streamId === 0
    ) {
      throw new Http2ProtocolError(
        'PROTOCOL_ERROR',
        `frame type ${type} requires nonzero stream id`,
        0
      );
    }

    // CONTINUATION sequencing: while a header block is open, only
    // CONTINUATION frames on that stream may arrive.
    if (this._continuationStream !== null) {
      if (type !== Http2FrameType.CONTINUATION || streamId !== this._continuationStream) {
        throw new Http2ProtocolError(
          'PROTOCOL_ERROR',
          `expected CONTINUATION on stream ${this._continuationStream}, got type ${type} on ${streamId}`,
          streamId
        );
      }
    }

    switch (type) {
      case Http2FrameType.HEADERS: {
        // PADDED flag: first octet is pad length; padding must not
        // exceed the payload (§6.2).
        if (flags & Http2Flag.PADDED) {
          const padLen = payload.byteLength > 0 ? payload[0] : 0;
          if (padLen >= payload.byteLength) {
            throw new Http2ProtocolError(
              'PROTOCOL_ERROR',
              'HEADERS padding consumes entire payload',
              streamId
            );
          }
        }
        if (!(flags & Http2Flag.END_HEADERS)) {
          this._continuationStream = streamId;
        }
        break;
      }
      case Http2FrameType.CONTINUATION: {
        if (flags & Http2Flag.END_HEADERS) {
          this._continuationStream = null;
        }
        break;
      }
      case Http2FrameType.DATA: {
        if (flags & Http2Flag.PADDED) {
          const padLen = payload.byteLength > 0 ? payload[0] : 0;
          if (padLen >= payload.byteLength) {
            throw new Http2ProtocolError(
              'PROTOCOL_ERROR',
              'DATA padding consumes entire payload',
              streamId
            );
          }
        }
        // Flow control counts the *whole* frame payload incl. padding.
        this.connRecvWindow.consume(payload.byteLength);
        this._streamWindow(streamId).consume(payload.byteLength);
        break;
      }
      case Http2FrameType.WINDOW_UPDATE: {
        if (payload.byteLength !== 4) {
          throw new Http2ProtocolError(
            'FRAME_SIZE_ERROR',
            'WINDOW_UPDATE payload must be 4 bytes',
            streamId
          );
        }
        const increment =
          ((payload[0] & 0x7f) << 24) |
          (payload[1] << 16) |
          (payload[2] << 8) |
          payload[3];
        // The peer grants *us* credit to send — WINDOW_UPDATE refills
        // the send-side windows, not the receive side.
        if (streamId === 0) {
          this.connSendWindow.applyWindowUpdate(increment, 0);
        } else {
          this._streamWindow(streamId).applyWindowUpdate(increment, streamId);
        }
        break;
      }
      case Http2FrameType.RST_STREAM: {
        if (payload.byteLength !== 4) {
          throw new Http2ProtocolError(
            'FRAME_SIZE_ERROR',
            'RST_STREAM payload must be 4 bytes',
            streamId
          );
        }
        break;
      }
      case Http2FrameType.PING: {
        if (payload.byteLength !== 8) {
          throw new Http2ProtocolError(
            'FRAME_SIZE_ERROR',
            'PING payload must be 8 bytes',
            0
          );
        }
        break;
      }
      default:
        break; // unknown frame types are ignored per §5.5
    }
  }

  /* ---------------------------------------------------------------- */
  /* Encoding                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * Serialize one frame to wire bytes. Length is taken from the
   * payload; oversized payloads throw `FrameSizeError` before encoding.
   */
  encode(frame: Omit<Http2Frame, 'length'>): Uint8Array {
    const length = frame.payload.byteLength;
    if (length > this._maxFrameSize) {
      throw new FrameSizeError(length, this._maxFrameSize, frame.streamId);
    }
    if (frame.streamId < 0 || frame.streamId > HTTP2_MAX_WINDOW) {
      throw new RangeError(`stream id ${frame.streamId} out of range`);
    }

    const out = new Uint8Array(HTTP2_HEADER_BYTES + length);
    out[0] = (length >>> 16) & 0xff;
    out[1] = (length >>> 8) & 0xff;
    out[2] = length & 0xff;
    out[3] = frame.type & 0xff;
    out[4] = frame.flags & 0xff;
    out[5] = (frame.streamId >>> 24) & 0x7f;
    out[6] = (frame.streamId >>> 16) & 0xff;
    out[7] = (frame.streamId >>> 8) & 0xff;
    out[8] = frame.streamId & 0xff;
    out.set(frame.payload, HTTP2_HEADER_BYTES);

    // Outbound DATA consumes send-side flow control symmetrically.
    if (frame.type === Http2FrameType.DATA) {
      this.connSendWindow.consume(length);
      this._streamWindow(frame.streamId).consume(length);
    }

    this._framesEncoded++;
    return out;
  }

  /** Convenience: encode a SETTINGS frame from a settings map. */
  encodeSettings(settings: ReadonlyMap<number, number>, ack = false): Uint8Array {
    if (ack) {
      return this.encode({
        type: Http2FrameType.SETTINGS,
        flags: Http2Flag.ACK,
        streamId: 0,
        payload: new Uint8Array(0),
      });
    }
    const payload = new Uint8Array(settings.size * 6);
    let i = 0;
    for (const [id, value] of settings) {
      payload[i] = (id >>> 8) & 0xff;
      payload[i + 1] = id & 0xff;
      payload[i + 2] = (value >>> 24) & 0xff;
      payload[i + 3] = (value >>> 16) & 0xff;
      payload[i + 4] = (value >>> 8) & 0xff;
      payload[i + 5] = value & 0xff;
      i += 6;
    }
    return this.encode({
      type: Http2FrameType.SETTINGS,
      flags: 0,
      streamId: 0,
      payload,
    });
  }

  /** Convenience: encode a WINDOW_UPDATE frame. */
  encodeWindowUpdate(streamId: number, increment: number): Uint8Array {
    if (increment <= 0 || increment > HTTP2_MAX_WINDOW) {
      throw new RangeError(`window increment ${increment} out of range`);
    }
    const payload = new Uint8Array(4);
    payload[0] = (increment >>> 24) & 0x7f;
    payload[1] = (increment >>> 16) & 0xff;
    payload[2] = (increment >>> 8) & 0xff;
    payload[3] = increment & 0xff;
    return this.encode({
      type: Http2FrameType.WINDOW_UPDATE,
      flags: 0,
      streamId,
      payload,
    });
  }

  /**
   * Allocate the next stream id this endpoint may open. Client ids
   * are odd, server ids even (§5.1.1); the codec tracks the lowest
   * unused id locally — callers multiplexing in parallel must keep
   * their own stream table.
   */
  private _nextStreamId: number | null = null;
  nextOutboundStreamId(): number {
    if (this._nextStreamId === null) {
      this._nextStreamId = this._server ? 2 : 1;
    }
    const id = this._nextStreamId;
    this._nextStreamId += 2;
    return id;
  }

  /** Stream-level window for `streamId`, created lazily at default. */
  streamWindow(streamId: number): FlowWindow {
    return this._streamWindow(streamId);
  }

  /* ---------------------------------------------------------------- */
  /* Introspection                                                     */
  /* ---------------------------------------------------------------- */

  get framesDecoded(): number {
    return this._framesDecoded;
  }

  get framesEncoded(): number {
    return this._framesEncoded;
  }

  get bytesBuffered(): number {
    return this._buf.length - this._readIdx;
  }

  get bytesFed(): number {
    return this._bytesFed;
  }

  get isServer(): boolean {
    return this._server;
  }

  /** True while a header block is mid-CONTINUATION sequence. */
  get inHeaderBlock(): boolean {
    return this._continuationStream !== null;
  }

  private _streamWindow(streamId: number): FlowWindow {
    let w = this._streamWindows.get(streamId);
    if (!w) {
      w = new FlowWindow();
      this._streamWindows.set(streamId, w);
    }
    return w;
  }
}
