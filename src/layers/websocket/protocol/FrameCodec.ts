/**
 * FrameCodec — RFC 6455 §5 frame parser and serializer.
 *
 * Implements the complete base-framing protocol at bit level:
 *
 * ```
 *  0                   1                   2                   3
 *  0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
 * +-+-+-+-+-------+-+-------------+-------------------------------+
 * |F|R|R|R| opcode|M| Payload len |    Extended payload length    |
 * |I|S|S|S|  (4)  |A|     (7)     |             (16/64)           |
 * |N|V|V|V|       |S|             |   (if payload len==126/127)   |
 * | |1|2|3|       |K|             |                               |
 * +-+-+-+-+-------+-+-------------+ - - - - - - - - - - - - - - - +
 * |     Extended payload length continued, if payload len == 127  |
 * + - - - - - - - - - - - - - - - +-------------------------------+
 * |                               |Masking-key, if MASK set to 1  |
 * +-------------------------------+-------------------------------+
 * | Masking-key (continued)       |          Payload Data         |
 * +-------------------------------- - - - - - - - - - - - - - - - +
 * :                     Payload Data continued ...                :
 * ```
 *
 * Design notes:
 * - The parser is *streaming*: feed arbitrary chunks via `feed()` and it
 *   emits zero or more complete frames, keeping leftovers in an internal
 *   buffer. This matches how TCP delivers bytes in real deployments.
 * - Strictness flags implement the direction-dependent rules of §5.1:
 *   client→server frames MUST be masked, server→client frames MUST NOT.
 * - The 64-bit length field is read with bounds checking; lengths beyond
 *   Number.MAX_SAFE_INTEGER or a configured cap are rejected up-front so
 *   a malicious 0x7fff... header cannot trigger a huge allocation.
 *
 * Complexity: parse is O(n) in bytes consumed; unmasking is O(payload).
 *
 * @module WebsocketLayer/Protocol
 */

import {
  WsFrame,
  WsOpcode,
  WsCloseCode,
  WsProtocolError,
  isControlOpcode,
  isKnownOpcode,
} from './types';

/**
 * Codec configuration — direction strictness and size caps.
 */
export interface FrameCodecOptions {
  /**
   * Require incoming frames to be masked (true when acting as a server,
   * per RFC 6455 §5.1). Default false (acting as a client).
   */
  readonly requireMask?: boolean;
  /**
   * Forbid incoming masked frames (true when acting as a server *sending*,
   * i.e. validating our own output in tests). Usually left false.
   */
  readonly forbidMask?: boolean;
  /**
   * Reject frames whose RSV bits are set (no extension negotiated).
   * Default true.
   */
  readonly rejectRsv?: boolean;
  /**
   * Maximum accepted payload length in bytes. Frames declaring more are
   * rejected before the payload is even read. Default 16 MiB.
   */
  readonly maxPayloadBytes?: number;
  /**
   * Enforce control-frame rules (no fragmentation, payload <= 125).
   * Default true.
   */
  readonly enforceControlRules?: boolean;
}

const DEFAULT_MAX_PAYLOAD = 16 * 1024 * 1024; // 16 MiB
const MAX_CONTROL_PAYLOAD = 125;

/**
 * Apply (or remove) the RFC 6455 §5.3 masking transform.
 * The operation is its own inverse: masked[i] = raw[i] XOR key[i mod 4].
 *
 * Processed in-place on a copy — callers pass a fresh buffer from
 * `Buffer.alloc`, so mutation is safe and allocation-free.
 */
export function applyMask(payload: Buffer, maskingKey: Buffer): Buffer {
  if (maskingKey.byteLength !== 4) {
    throw new WsProtocolError('Masking key must be exactly 4 bytes');
  }
  const out = Buffer.allocUnsafe(payload.byteLength);
  for (let i = 0; i < payload.byteLength; i++) {
    out[i] = payload[i] ^ maskingKey[i & 3];
  }
  return out;
}

/**
 * Streaming frame decoder + stateless frame encoder.
 *
 * Typical usage:
 * ```
 * const codec = new FrameCodec({ requireMask: true }); // server side
 * socket.on('data', (chunk) => {
 *   for (const frame of codec.feed(chunk)) { ... }
 * });
 * const bytes = FrameCodec.encode({ opcode: WsOpcode.TEXT, payload });
 * ```
 */
export class FrameCodec {
  private readonly _requireMask: boolean;
  private readonly _forbidMask: boolean;
  private readonly _rejectRsv: boolean;
  private readonly _maxPayload: number;
  private readonly _enforceControl: boolean;

  /** Leftover bytes from the previous `feed()` call. */
  private _pending: Buffer;
  /** Lifetime stats for diagnostics. */
  private _framesDecoded = 0;
  private _bytesConsumed = 0;

  constructor(options: FrameCodecOptions = {}) {
    this._requireMask = options.requireMask ?? false;
    this._forbidMask = options.forbidMask ?? false;
    this._rejectRsv = options.rejectRsv ?? true;
    this._maxPayload = options.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD;
    this._enforceControl = options.enforceControlRules ?? true;
    this._pending = Buffer.alloc(0);
  }

  get framesDecoded(): number {
    return this._framesDecoded;
  }

  get bytesConsumed(): number {
    return this._bytesConsumed;
  }

  get pendingBytes(): number {
    return this._pending.byteLength;
  }

  /**
   * Feed raw bytes into the decoder. Returns every complete frame that
   * could be parsed; incomplete tail bytes are retained internally.
   *
   * Throws {@link WsProtocolError} on the first malformed frame — the
   * connection should then be failed with `error.closeCode`.
   */
  feed(chunk: Buffer): WsFrame[] {
    if (chunk.byteLength === 0 && this._pending.byteLength === 0) {
      return [];
    }
    this._pending = this._pending.byteLength === 0 ? chunk : Buffer.concat([this._pending, chunk]);

    const frames: WsFrame[] = [];
    for (;;) {
      const frame = this._tryParseFrame();
      if (frame === null) break;
      frames.push(frame);
      this._framesDecoded++;
      this._bytesConsumed += frame.wireBytes;
      this._pending = this._pending.subarray(frame.wireBytes);
    }
    return frames;
  }

  /**
   * Reset the streaming buffer — call after a connection reset so stale
   * partial frames do not poison the next session.
   */
  reset(): void {
    this._pending = Buffer.alloc(0);
  }

  /**
   * Attempt to parse exactly one frame from `_pending`.
   * Returns null when more bytes are needed.
   */
  private _tryParseFrame(): WsFrame | null {
    const buf = this._pending;
    if (buf.byteLength < 2) return null;

    // ---- Byte 0: FIN + RSV1..3 + opcode ----
    const b0 = buf[0];
    const fin = (b0 & 0x80) !== 0;
    const rsv1 = (b0 & 0x40) !== 0;
    const rsv2 = (b0 & 0x20) !== 0;
    const rsv3 = (b0 & 0x10) !== 0;
    const opcode = b0 & 0x0f;

    if (this._rejectRsv && (rsv1 || rsv2 || rsv3)) {
      throw new WsProtocolError(`RSV bits set (0x${(b0 & 0x70).toString(16)}) without negotiated extension`);
    }
    if (!isKnownOpcode(opcode)) {
      throw new WsProtocolError(`Unknown opcode 0x${opcode.toString(16)}`);
    }

    // ---- Byte 1: MASK + 7-bit payload length ----
    const b1 = buf[1];
    const masked = (b1 & 0x80) !== 0;
    let payloadLength = b1 & 0x7f;
    let offset = 2;

    if (this._requireMask && !masked) {
      throw new WsProtocolError('Client frame received unmasked');
    }
    if (this._forbidMask && masked) {
      throw new WsProtocolError('Masked frame received where masking is forbidden');
    }

    // ---- Extended payload length ----
    if (payloadLength === 126) {
      if (buf.byteLength < offset + 2) return null;
      payloadLength = buf.readUInt16BE(offset);
      offset += 2;
    } else if (payloadLength === 127) {
      if (buf.byteLength < offset + 8) return null;
      const big = buf.readBigUInt64BE(offset);
      offset += 8;
      // Reject absurd lengths before they can drive allocations.
      if (big > BigInt(this._maxPayload)) {
        throw new WsProtocolError(
          `Payload length ${big} exceeds maximum ${this._maxPayload}`,
          WsCloseCode.MESSAGE_TOO_BIG
        );
      }
      payloadLength = Number(big);
      // §5.2: for 127, the MSB MUST be zero — readBigUInt64BE already
      // guarantees a non-negative value; the check above bounds it.
    }

    if (payloadLength > this._maxPayload) {
      throw new WsProtocolError(
        `Payload length ${payloadLength} exceeds maximum ${this._maxPayload}`,
        WsCloseCode.MESSAGE_TOO_BIG
      );
    }

    // ---- Control-frame invariants (RFC 6455 §5.5) ----
    if (this._enforceControl && isControlOpcode(opcode)) {
      if (!fin) {
        throw new WsProtocolError('Control frame fragmented (FIN=0)');
      }
      if (payloadLength > MAX_CONTROL_PAYLOAD) {
        throw new WsProtocolError(`Control payload ${payloadLength} > 125 bytes`);
      }
    }

    // ---- Masking key ----
    let maskingKey: Buffer | null = null;
    if (masked) {
      if (buf.byteLength < offset + 4) return null;
      maskingKey = buf.subarray(offset, offset + 4);
      offset += 4;
    }

    // ---- Payload ----
    if (buf.byteLength < offset + payloadLength) return null;
    const rawPayload = buf.subarray(offset, offset + payloadLength);
    const payload = masked && maskingKey ? applyMask(rawPayload, maskingKey) : Buffer.from(rawPayload);
    offset += payloadLength;

    return {
      fin,
      rsv1,
      rsv2,
      rsv3,
      opcode: opcode as WsOpcode,
      masked,
      maskingKey: maskingKey ? Buffer.from(maskingKey) : null,
      payloadLength,
      payload,
      wireBytes: offset,
    };
  }

  /**
   * Serialize one frame to wire bytes.
   *
   * @param opcode   frame opcode
   * @param payload  payload bytes (unmasked — masking is applied here)
   * @param options  fin / mask / maskingKey overrides
   *
   * The smallest legal length encoding is chosen automatically
   * (7-bit, 16-bit or 64-bit per §5.2).
   */
  static encode(
    opcode: WsOpcode,
    payload: Buffer,
    options: { fin?: boolean; mask?: boolean; maskingKey?: Buffer; rsv1?: boolean } = {}
  ): Buffer {
    const fin = options.fin ?? true;
    const mask = options.mask ?? false;
    const len = payload.byteLength;

    // Header length: 2 + ext-len + optional 4-byte mask key
    let extLen = 0;
    if (len >= 126 && len <= 0xffff) extLen = 2;
    else if (len > 0xffff) extLen = 8;

    const headerLen = 2 + extLen + (mask ? 4 : 0);
    const out = Buffer.allocUnsafe(headerLen + len);

    // Byte 0
    let b0 = opcode & 0x0f;
    if (fin) b0 |= 0x80;
    if (options.rsv1) b0 |= 0x40;
    out[0] = b0;

    // Byte 1 + extended length
    let pos = 1;
    if (extLen === 0) {
      out[pos++] = (mask ? 0x80 : 0) | len;
    } else if (extLen === 2) {
      out[pos++] = (mask ? 0x80 : 0) | 126;
      out.writeUInt16BE(len, pos);
      pos += 2;
    } else {
      out[pos++] = (mask ? 0x80 : 0) | 127;
      out.writeBigUInt64BE(BigInt(len), pos);
      pos += 8;
    }

    // Masking key + (possibly masked) payload
    if (mask) {
      const key = options.maskingKey ?? randomMaskKey();
      key.copy(out, pos);
      pos += 4;
      applyMask(payload, key).copy(out, pos);
    } else {
      payload.copy(out, pos);
    }
    return out;
  }

  /** Convenience: a complete masked client text frame. */
  static encodeText(text: string, mask = true): Buffer {
    return FrameCodec.encode(WsOpcode.TEXT, Buffer.from(text, 'utf8'), { mask });
  }

  /** Convenience: a complete binary frame. */
  static encodeBinary(data: Buffer, mask = false): Buffer {
    return FrameCodec.encode(WsOpcode.BINARY, data, { mask });
  }

  /** Convenience: a ping control frame. */
  static encodePing(body: Buffer = Buffer.alloc(0), mask = false): Buffer {
    return FrameCodec.encode(WsOpcode.PING, body, { mask });
  }

  /** Convenience: a pong control frame (echoes ping body per §5.5.3). */
  static encodePong(body: Buffer = Buffer.alloc(0), mask = false): Buffer {
    return FrameCodec.encode(WsOpcode.PONG, body, { mask });
  }

  /**
   * Convenience: a close frame carrying a status code and optional
   * UTF-8 reason (§5.5.1).
   */
  static encodeClose(code: number, reason = '', mask = false): Buffer {
    const reasonBytes = Buffer.from(reason, 'utf8');
    const body = Buffer.allocUnsafe(2 + reasonBytes.byteLength);
    body.writeUInt16BE(code, 0);
    reasonBytes.copy(body, 2);
    return FrameCodec.encode(WsOpcode.CLOSE, body, { mask });
  }

  /**
   * Fragment a payload into N frames. The first carries the real opcode;
   * subsequent frames are CONTINUATION with FIN set on the last.
   * Useful for testing reassembly and for very large messages.
   */
  static fragment(
    opcode: WsOpcode.TEXT | WsOpcode.BINARY,
    payload: Buffer,
    fragmentSize: number,
    mask = false
  ): Buffer[] {
    if (fragmentSize <= 0) throw new WsProtocolError('fragmentSize must be > 0');
    if (payload.byteLength === 0) {
      return [FrameCodec.encode(opcode, payload, { mask })];
    }
    const frames: Buffer[] = [];
    let offset = 0;
    let first = true;
    while (offset < payload.byteLength) {
      const slice = payload.subarray(offset, offset + fragmentSize);
      const isLast = offset + fragmentSize >= payload.byteLength;
      frames.push(
        FrameCodec.encode(first ? opcode : WsOpcode.CONTINUATION, slice, { fin: isLast, mask })
      );
      first = false;
      offset += fragmentSize;
    }
    return frames;
  }
}

/**
 * Cryptographically-random 4-byte masking key.
 * Uses `crypto.randomBytes` — Math.random would be a spec violation in
 * spirit (predictable masks defeat the proxy-poisoning protection).
 */
function randomMaskKey(): Buffer {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { randomBytes } = require('crypto') as typeof import('crypto');
  return randomBytes(4);
}
