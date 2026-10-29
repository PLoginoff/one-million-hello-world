/**
 * MessageReassembler — RFC 6455 §5.4 fragmentation/reassembly.
 *
 * A *message* is the application-level unit; a *frame* is the wire unit.
 * Senders may split a message across multiple frames for streaming or
 * MTU reasons:
 *
 * ```
 *   Frame 1: FIN=0, opcode=TEXT,  payload="hel"
 *   Frame 2: FIN=0, opcode=CONT,  payload="lo "
 *   Frame 3: FIN=1, opcode=CONT,  payload="world"
 *   → one TEXT message "hello world" (3 fragments)
 * ```
 *
 * Rules enforced here (§5.4):
 *  - A data frame (TEXT/BINARY) starting a new message must not arrive
 *    while one is already in progress → protocol error.
 *  - A CONTINUATION outside a fragmented message → protocol error.
 *  - Control frames (PING/PONG/CLOSE) may be interleaved *inside* a
 *    fragmented message and are surfaced immediately, not buffered.
 *  - Complete TEXT messages are UTF-8 validated at the message boundary
 *    (a valid frame can split a multi-byte code point — validation must
 *    happen on the whole message, not per fragment).
 *
 * Complexity: reassembly is O(total payload bytes); memory is bounded by
 * the configured max message size.
 *
 * @module WebsocketLayer/Protocol
 */

import { TextDecoder } from 'util';
import {
  WsFrame,
  WsMessage,
  WsOpcode,
  WsCloseCode,
  WsProtocolError,
  WsCloseBody,
  isControlOpcode,
  isValidCloseCode,
} from './types';

/**
 * Events produced by pushing a frame through the reassembler.
 * Exactly one of the fields is set.
 */
export type ReassemblerEvent =
  | { readonly kind: 'message'; readonly message: WsMessage }
  | { readonly kind: 'ping'; readonly body: Buffer }
  | { readonly kind: 'pong'; readonly body: Buffer }
  | { readonly kind: 'close'; readonly close: WsCloseBody };

export interface ReassemblerOptions {
  /** Maximum assembled message size in bytes. Default 16 MiB. */
  readonly maxMessageBytes?: number;
  /** Maximum fragments per message (DoS guard). Default 1024. */
  readonly maxFragments?: number;
  /** Validate UTF-8 on completed text messages. Default true. */
  readonly validateUtf8?: boolean;
}

const DEFAULT_MAX_MESSAGE = 16 * 1024 * 1024;
const DEFAULT_MAX_FRAGMENTS = 1024;

export class MessageReassembler {
  private readonly _maxMessage: number;
  private readonly _maxFragments: number;
  private readonly _validateUtf8: boolean;
  private readonly _utf8: TextDecoder;

  /** Opcode of the in-flight fragmented message, or null when idle. */
  private _messageOpcode: WsOpcode.TEXT | WsOpcode.BINARY | null = null;
  /** Chunks received so far for the in-flight message. */
  private _chunks: Buffer[] = [];
  /** Running total of buffered bytes (avoids re-summing per frame). */
  private _bufferedBytes = 0;
  private _fragmentCount = 0;

  constructor(options: ReassemblerOptions = {}) {
    this._maxMessage = options.maxMessageBytes ?? DEFAULT_MAX_MESSAGE;
    this._maxFragments = options.maxFragments ?? DEFAULT_MAX_FRAGMENTS;
    this._validateUtf8 = options.validateUtf8 ?? true;
    // `fatal: true` makes decode() throw on malformed UTF-8 instead of
    // emitting U+FFFD replacement characters.
    this._utf8 = new TextDecoder('utf-8', { fatal: true });
  }

  /** Bytes currently held for an incomplete message. */
  get bufferedBytes(): number {
    return this._bufferedBytes;
  }

  /** True while a fragmented message is in progress. */
  get fragmenting(): boolean {
    return this._messageOpcode !== null;
  }

  /**
   * Push one decoded frame. Returns an event (message complete, control
   * frame received) or null when the frame was a non-final fragment.
   */
  push(frame: WsFrame): ReassemblerEvent | null {
    // --- Control frames: always dispatched immediately, even mid-message.
    if (isControlOpcode(frame.opcode)) {
      return this._handleControl(frame);
    }

    // --- Data frames ---
    if (frame.opcode === WsOpcode.CONTINUATION) {
      if (this._messageOpcode === null) {
        throw new WsProtocolError('CONTINUATION frame without an open message');
      }
      return this._accumulate(frame);
    }

    // TEXT or BINARY
    if (this._messageOpcode !== null) {
      throw new WsProtocolError(
        `New ${WsOpcode[frame.opcode]} message while fragmented message in progress`
      );
    }
    if (frame.fin) {
      // Unfragmented single-frame message — fast path.
      const message: WsMessage = {
        // Control frames and CONTINUATION are handled above — only TEXT
        // and BINARY reach this point, but the enum type doesn't narrow.
        opcode: frame.opcode as WsOpcode.TEXT | WsOpcode.BINARY,
        payload: Buffer.from(frame.payload),
        fragmentCount: 1,
      };
      this._validateMessage(message);
      return { kind: 'message', message };
    }
    // First fragment of a multi-frame message.
    this._messageOpcode = frame.opcode as WsOpcode.TEXT | WsOpcode.BINARY;
    this._chunks = [Buffer.from(frame.payload)];
    this._bufferedBytes = frame.payload.byteLength;
    this._fragmentCount = 1;
    this._checkSize();
    return null;
  }

  private _accumulate(frame: WsFrame): ReassemblerEvent | null {
    this._fragmentCount++;
    if (this._fragmentCount > this._maxFragments) {
      this._reset();
      throw new WsProtocolError(
        `Message exceeded ${this._maxFragments} fragments`,
        WsCloseCode.MESSAGE_TOO_BIG
      );
    }
    this._chunks.push(Buffer.from(frame.payload));
    this._bufferedBytes += frame.payload.byteLength;
    this._checkSize();

    if (!frame.fin) return null;

    const message: WsMessage = {
      opcode: this._messageOpcode as WsOpcode.TEXT | WsOpcode.BINARY,
      payload: Buffer.concat(this._chunks, this._bufferedBytes),
      fragmentCount: this._fragmentCount,
    };
    this._reset();
    this._validateMessage(message);
    return { kind: 'message', message };
  }

  private _handleControl(frame: WsFrame): ReassemblerEvent {
    switch (frame.opcode) {
      case WsOpcode.PING:
        return { kind: 'ping', body: Buffer.from(frame.payload) };
      case WsOpcode.PONG:
        return { kind: 'pong', body: Buffer.from(frame.payload) };
      case WsOpcode.CLOSE:
        return { kind: 'close', close: MessageReassembler.parseCloseBody(frame.payload) };
      default:
        // Unreachable — codec rejects unknown opcodes first.
        throw new WsProtocolError(`Unexpected control opcode 0x${frame.opcode.toString(16)}`);
    }
  }

  private _checkSize(): void {
    if (this._bufferedBytes > this._maxMessage) {
      this._reset();
      throw new WsProtocolError(
        `Message size exceeds ${this._maxMessage} bytes`,
        WsCloseCode.MESSAGE_TOO_BIG
      );
    }
  }

  private _validateMessage(message: WsMessage): void {
    if (message.opcode === WsOpcode.TEXT && this._validateUtf8) {
      try {
        this._utf8.decode(message.payload);
      } catch {
        throw new WsProtocolError('Invalid UTF-8 in text message', WsCloseCode.INVALID_PAYLOAD);
      }
    }
  }

  private _reset(): void {
    this._messageOpcode = null;
    this._chunks = [];
    this._bufferedBytes = 0;
    this._fragmentCount = 0;
  }

  /**
   * Parse the body of a CLOSE frame (§5.5.1):
   *   [ 2-byte status code ][ UTF-8 reason ]
   * A close frame may have an empty body (no status) but a 1-byte body
   * is always malformed (can't fit the u16 code).
   */
  static parseCloseBody(payload: Buffer): WsCloseBody {
    if (payload.byteLength === 0) {
      return { code: WsCloseCode.NO_STATUS_RECEIVED, reason: '' };
    }
    if (payload.byteLength === 1) {
      throw new WsProtocolError('Close body of 1 byte is malformed', WsCloseCode.PROTOCOL_ERROR);
    }
    const code = payload.readUInt16BE(0);
    if (!isValidCloseCode(code)) {
      throw new WsProtocolError(`Invalid close code ${code}`, WsCloseCode.PROTOCOL_ERROR);
    }
    const reasonBytes = payload.subarray(2);
    try {
      const reason = new TextDecoder('utf-8', { fatal: true }).decode(reasonBytes);
      return { code, reason };
    } catch {
      throw new WsProtocolError('Invalid UTF-8 in close reason', WsCloseCode.INVALID_PAYLOAD);
    }
  }
}
