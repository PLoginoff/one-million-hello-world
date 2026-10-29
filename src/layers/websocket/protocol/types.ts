/**
 * WebSocket Protocol Types — RFC 6455
 *
 * Shared type definitions for the wire-level WebSocket implementation:
 * opcodes, close codes, frame shapes, handshake results and session
 * state. These types are intentionally transport-agnostic — the codec
 * works on raw byte buffers and never touches a socket.
 *
 * @module WebsocketLayer/Protocol
 */

/**
 * RFC 6455 §5.2 — frame opcodes (4-bit field).
 *
 * - Control frames (0x8–0xF) MUST NOT be fragmented and MUST have a
 *   payload of at most 125 bytes.
 * - Opcodes 0x3–0x7 and 0xB–0xF are reserved for future use; receiving
 *   one is a protocol error (fail with 1002).
 */
export enum WsOpcode {
  /** Continuation of a fragmented message. */
  CONTINUATION = 0x0,
  /** Text message — payload MUST be valid UTF-8. */
  TEXT = 0x1,
  /** Binary message — opaque payload. */
  BINARY = 0x2,
  /** Connection close handshake. */
  CLOSE = 0x8,
  /** Keepalive ping — peer MUST reply with a pong carrying the same body. */
  PING = 0x9,
  /** Keepalive pong — unsolicited pongs are legal but meaningless. */
  PONG = 0xa,
}

/**
 * RFC 6455 §7.4.1 — registered close status codes.
 * Codes 1005, 1006 and 1015 are reserved and MUST NOT appear on the wire;
 * they exist only as local pseudo-statuses for reporting.
 */
export enum WsCloseCode {
  /** Normal closure; the purpose of the connection was fulfilled. */
  NORMAL = 1000,
  /** Endpoint is going away (server shutdown, page navigation). */
  GOING_AWAY = 1001,
  /** Protocol error (bad frame, RSV set without extension, etc.). */
  PROTOCOL_ERROR = 1002,
  /** Received a data type the endpoint cannot handle. */
  UNSUPPORTED_DATA = 1003,
  /** Reserved — means "no status code present". Never sent on the wire. */
  NO_STATUS_RECEIVED = 1005,
  /** Reserved — connection dropped without a close frame. Never sent. */
  ABNORMAL = 1006,
  /** Payload failed consistency check (e.g. invalid UTF-8 in text). */
  INVALID_PAYLOAD = 1007,
  /** Message violated the endpoint's policy. */
  POLICY_VIOLATION = 1008,
  /** Message too large to process. */
  MESSAGE_TOO_BIG = 1009,
  /** Client expected a server extension negotiation that never came. */
  MANDATORY_EXTENSION = 1010,
  /** Server hit an unexpected condition (internal error). */
  INTERNAL_ERROR = 1011,
  /** Reserved — TLS handshake failure indicator. Never sent. */
  TLS_HANDSHAKE = 1015,
}

/**
 * A fully-parsed WebSocket frame.
 *
 * `payload` is already unmasked. `payloadLength` is the decoded length
 * (equal to `payload.byteLength`); keeping it separate documents where
 * the value came from on the wire.
 */
export interface WsFrame {
  /** Final fragment of a message (always true for unfragmented/control). */
  readonly fin: boolean;
  /** Reserved bit 1 — must be 0 unless an extension negotiated it. */
  readonly rsv1: boolean;
  /** Reserved bit 2. */
  readonly rsv2: boolean;
  /** Reserved bit 3. */
  readonly rsv3: boolean;
  /** Frame opcode. */
  readonly opcode: WsOpcode;
  /** Whether the payload was masked on the wire. */
  readonly masked: boolean;
  /** The 4-byte masking key, if `masked` is true. */
  readonly maskingKey: Buffer | null;
  /** Declared payload length (post-decode, pre-unmask it equals actual bytes). */
  readonly payloadLength: number;
  /** Unmasked payload bytes. */
  readonly payload: Buffer;
  /** Total bytes this frame consumed on the wire, including header. */
  readonly wireBytes: number;
}

/**
 * Wire-level protocol violation. `closeCode` is the code the endpoint
 * should send when failing the connection (RFC 6455 §7.1.7).
 */
export class WsProtocolError extends Error {
  readonly closeCode: number;

  constructor(message: string, closeCode: number = WsCloseCode.PROTOCOL_ERROR) {
    super(message);
    this.name = 'WsProtocolError';
    this.closeCode = closeCode;
  }
}

/**
 * A reassembled application-level message (one or more frames).
 */
export interface WsMessage {
  /** TEXT or BINARY — never a control opcode. */
  readonly opcode: WsOpcode.TEXT | WsOpcode.BINARY;
  /** Concatenated payload of all fragments. */
  readonly payload: Buffer;
  /** Number of wire frames that made up this message. */
  readonly fragmentCount: number;
}

/**
 * Parsed body of a CLOSE frame.
 */
export interface WsCloseBody {
  /** Status code, or `NO_STATUS_RECEIVED` if the body was empty. */
  readonly code: number;
  /** UTF-8 reason string, possibly empty. */
  readonly reason: string;
}

/**
 * Result of validating a client opening handshake (RFC 6455 §4.2.1).
 */
export interface HandshakeValidation {
  /** Whether all required preconditions held. */
  readonly valid: boolean;
  /** The `Sec-WebSocket-Accept` value to send back, if valid. */
  readonly acceptKey: string | null;
  /** Human-readable rejection reasons, if invalid. */
  readonly errors: readonly string[];
  /** Negotiated subprotocol, if the client offered one we support. */
  readonly subprotocol: string | null;
}

/**
 * Lifecycle states for a logical WebSocket connection
 * (RFC 6455 §4 + close handshake in §7).
 */
export enum WsSessionState {
  /** Handshake not yet completed. */
  CONNECTING = 'CONNECTING',
  /** Handshake complete; frames may flow both ways. */
  OPEN = 'OPEN',
  /** A close frame was sent or received; finishing the handshake. */
  CLOSING = 'CLOSING',
  /** Close handshake complete (or TCP dropped). Terminal. */
  CLOSED = 'CLOSED',
}

/**
 * Per-connection backpressure statistics. `bufferedAmount` mirrors the
 * browser API: bytes queued but not yet handed to the transport.
 */
export interface BackpressureStats {
  /** Bytes currently queued for the transport. */
  readonly bufferedAmount: number;
  /** Number of complete messages (not frames) waiting in the queue. */
  readonly queuedMessages: number;
  /** High-water mark configured for the session. */
  readonly highWaterMark: number;
  /** True when bufferedAmount >= highWaterMark (producers should pause). */
  readonly overHighWaterMark: boolean;
  /** Lifetime bytes written through this session. */
  readonly totalBytesSent: number;
  /** Lifetime frames dropped due to backpressure policy. */
  readonly droppedMessages: number;
}

/** Guards: is `op` a data-frame opcode (text/binary/continuation)? */
export function isDataOpcode(op: number): boolean {
  return op === WsOpcode.TEXT || op === WsOpcode.BINARY || op === WsOpcode.CONTINUATION;
}

/** Guards: is `op` a control-frame opcode (>= 0x8)? */
export function isControlOpcode(op: number): boolean {
  return op >= 0x8;
}

/** Guards: is `op` one of the four defined opcodes? */
export function isKnownOpcode(op: number): boolean {
  return (
    op === WsOpcode.CONTINUATION ||
    op === WsOpcode.TEXT ||
    op === WsOpcode.BINARY ||
    op === WsOpcode.CLOSE ||
    op === WsOpcode.PING ||
    op === WsOpcode.PONG
  );
}

/** Guards: is `code` a wire-legal close status code? */
export function isValidCloseCode(code: number): boolean {
  if (code === WsCloseCode.NO_STATUS_RECEIVED || code === WsCloseCode.ABNORMAL || code === WsCloseCode.TLS_HANDSHAKE) {
    return false;
  }
  // 1000–1011 registered; 3000–3999 frameworks; 4000–4999 private use.
  if (code >= 1000 && code <= 1011) return true;
  if (code >= 3000 && code <= 4999) return true;
  return false;
}
