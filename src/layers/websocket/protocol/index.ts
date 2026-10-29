/**
 * WebSocket wire-protocol submodule — RFC 6455.
 */

export * from './types';
export { FrameCodec, applyMask } from './FrameCodec';
export type { FrameCodecOptions } from './FrameCodec';
export {
  WS_GUID,
  SUPPORTED_VERSION,
  computeAcceptKey,
  generateClientKey,
  validateHandshake,
  buildHandshakeResponse,
  buildClientHandshake,
  verifyAcceptKey,
  parseHandshakeRequest,
  headerHasToken,
} from './Handshake';
export type { HandshakeRequest, HandshakeOptions } from './Handshake';
export { MessageReassembler } from './MessageReassembler';
export type { ReassemblerEvent, ReassemblerOptions } from './MessageReassembler';
export { WebSocketSession } from './WebSocketSession';
export type { TransportSink, SessionListeners, SessionOptions } from './WebSocketSession';
