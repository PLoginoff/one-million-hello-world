/**
 * Transport Engine — public exports.
 *
 * @module TransportLayer/Engine
 */

export * from './types';
export { LatencyHistogram } from './metrics';
export {
  BaseAdapter,
  LoopbackAdapter,
  SocketStubAdapter,
  ChunkedHttpAdapter,
  SseAdapter,
  WebSocketAdapter,
} from './adapters';
export type { SocketStubOptions, SseEvent, WebSocketAdapterOptions } from './adapters';
export { BackpressureWriteQueue } from './BackpressureWriteQueue';
export { StreamScheduler, sliceChunks } from './StreamScheduler';
export type { StreamHandle, StreamResult } from './StreamScheduler';
export {
  StreamMultiplexer,
  MuxDecoder,
  encodeMuxRecord,
} from './StreamMultiplexer';
export type { StreamState } from './StreamMultiplexer';
export { TransportEngine, CollectingByteSink } from './TransportEngine';
export type { TransportEngineOptions, CollectingSink } from './TransportEngine';
