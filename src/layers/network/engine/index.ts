/**
 * Network Engine — public exports.
 *
 * @module NetworkLayer/Engine
 */

export * from './types';
export { ConnectionPool } from './ConnectionPool';
export {
  SocketBackpressure,
  QueueFullError,
  SinkClosedError,
} from './SocketBackpressure';
export { TlsTermination, TlsAlert, TLS_MAX_FRAGMENT } from './TlsTermination';
export {
  Http2FrameCodec,
  FlowWindow,
  HTTP2_HEADER_BYTES,
  HTTP2_DEFAULT_MAX_FRAME,
  HTTP2_ABSOLUTE_MAX_FRAME,
  HTTP2_MAX_WINDOW,
  HTTP2_DEFAULT_WINDOW,
} from './Http2Framing';
export { KeepAliveTracker } from './KeepAliveTracker';
export {
  ConnectServerHandshake,
  ConnectClientHandshake,
  Socks5ServerHandshake,
  ProxyKind,
  ProxyPhase,
  ConnectState,
  Socks5State,
  Socks5Method,
  Socks5Cmd,
  Socks5AddrType,
  Socks5Reply,
  CONNECT_MAX_HEADER_BYTES,
  parseAuthority,
  concat,
  encodeAscii,
  socks5ConnectFrame,
  socks5Greeting,
} from './ProxyProtocol';
export type { ProxyTarget, FeedResult, ConnectRequest, Socks5ServerOptions } from './ProxyProtocol';
export {
  negotiateSocketOptions,
  SndBufGovernor,
  WriteDisposition,
  SOCKET_DEFAULTS,
  MSS_FLOOR,
  MSS_CEILING,
} from './SocketOptions';
export type {
  SocketOptionProfile,
  EffectiveSocketOptions,
  WriteOutcome,
} from './SocketOptions';
export {
  TokenBucket,
  ConnectionShaper,
  TrafficShaper,
  NetworkNamespace,
  NetnsRegistry,
} from './TrafficShaper';
export type {
  TokenBucketOptions,
  Permit,
  ShapePolicy,
  ShapeResult,
  VethPair,
  RouteResult,
} from './TrafficShaper';
