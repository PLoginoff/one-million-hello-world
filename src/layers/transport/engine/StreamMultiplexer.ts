/**
 * StreamMultiplexer — multiple logical streams over one byte transport.
 *
 * Wire framing (stub protocol, self-describing):
 *
 *   [u32 streamId][u8 flags][u24 payloadLength][payload…]
 *   ── 8-byte header ──────────────────────────
 *
 * flags: OPEN (0x1) — first record for a stream; END (0x2) — half-close;
 * RST (0x4) — abort/reset. A record may combine OPEN|payload.
 *
 * This is deliberately a *stub*: no flow-control windows, no HOLB
 * mitigation, no priority. It exists to exercise the multiplexing
 * semantics (per-stream state, interleaved writes, demux) that a real
 * HTTP/2-style layer would build on.
 *
 * Demuxer is streaming-safe: partial headers/payloads are buffered
 * across `feed` calls, matching TCP delivery behavior.
 *
 * @module TransportLayer/Engine
 */

import {
  ByteSink,
  MUX_HEADER_BYTES,
  MuxFlag,
  MuxRecord,
  StreamId,
} from './types';
import { TransportError } from '../utils/TransportError';

/** Per-stream lifecycle state tracked by the multiplexer. */
export type StreamState = 'open' | 'half-closed' | 'closed' | 'reset';

interface LogicalStream {
  readonly id: StreamId;
  state: StreamState;
  bytesSent: number;
  recordsSent: number;
}

/**
 * Encode one mux record into wire bytes.
 * Payload length must fit in 24 bits (16 MiB - 1).
 */
export function encodeMuxRecord(
  streamId: StreamId,
  flags: number,
  payload: Uint8Array
): Uint8Array {
  if (payload.byteLength > 0xffffff) {
    throw new TransportError(
      'MUX_PAYLOAD_TOO_LARGE',
      `Mux record payload ${payload.byteLength} exceeds 24-bit length field`,
      500
    );
  }
  const out = new Uint8Array(MUX_HEADER_BYTES + payload.byteLength);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, streamId >>> 0, false); // big-endian
  dv.setUint8(4, flags & 0xff);
  dv.setUint8(5, (payload.byteLength >> 16) & 0xff);
  dv.setUint8(6, (payload.byteLength >> 8) & 0xff);
  dv.setUint8(7, payload.byteLength & 0xff);
  out.set(payload, MUX_HEADER_BYTES);
  return out;
}

/** Streaming decoder; feed arbitrary byte slices, get complete records. */
export class MuxDecoder {
  private _pending: Uint8Array;

  constructor() {
    this._pending = new Uint8Array(0);
  }

  feed(chunk: Uint8Array): MuxRecord[] {
    if (chunk.byteLength > 0) {
      const merged = new Uint8Array(this._pending.byteLength + chunk.byteLength);
      merged.set(this._pending, 0);
      merged.set(chunk, this._pending.byteLength);
      this._pending = merged;
    }
    const out: MuxRecord[] = [];
    for (;;) {
      if (this._pending.byteLength < MUX_HEADER_BYTES) {
        break;
      }
      const dv = new DataView(
        this._pending.buffer,
        this._pending.byteOffset,
        this._pending.byteLength
      );
      const streamId = dv.getUint32(0, false);
      const flags = dv.getUint8(4);
      const length = (dv.getUint8(5) << 16) | (dv.getUint8(6) << 8) | dv.getUint8(7);
      if (this._pending.byteLength < MUX_HEADER_BYTES + length) {
        break; // wait for the rest of the payload
      }
      const payload = this._pending.slice(
        MUX_HEADER_BYTES,
        MUX_HEADER_BYTES + length
      );
      out.push({ streamId, flags, payload });
      this._pending = this._pending.subarray(MUX_HEADER_BYTES + length);
    }
    return out;
  }

  get pendingBytes(): number {
    return this._pending.byteLength;
  }
}

/**
 * Multiplexer over a single ByteSink (usually via a write queue's
 * adapter, but any sink works — records are written directly).
 *
 * Streams are opened lazily on first write. `closeStream` emits an END
 * record; `resetStream` emits RST. Peer side demuxes via `MuxDecoder`.
 */
export class StreamMultiplexer {
  private readonly _sink: ByteSink;
  private readonly _streams: Map<StreamId, LogicalStream>;
  private _nextId: StreamId;

  constructor(sink: ByteSink) {
    this._sink = sink;
    this._streams = new Map();
    this._nextId = 1;
  }

  /** Allocate a new logical stream id and mark it open. */
  openStream(): StreamId {
    const id = this._nextId;
    this._nextId += 2; // odd ids only (client-initiated convention)
    this._streams.set(id, { id, state: 'open', bytesSent: 0, recordsSent: 0 });
    this._sink.write(encodeMuxRecord(id, MuxFlag.OPEN, new Uint8Array(0)));
    return id;
  }

  /** Write data on a stream; emits OPEN flag on the stream's first record. */
  send(streamId: StreamId, payload: Uint8Array): boolean {
    const s = this._requireStream(streamId);
    if (s.state !== 'open') {
      throw new TransportError(
        'MUX_STREAM_CLOSED',
        `Stream ${streamId} is ${s.state}`,
        410
      );
    }
    const flags = s.recordsSent === 0 ? MuxFlag.OPEN : 0;
    const ok = this._sink.write(encodeMuxRecord(streamId, flags, payload));
    s.recordsSent++;
    s.bytesSent += payload.byteLength;
    return ok;
  }

  /** Half-close: no more data on this stream, peer may still send. */
  closeStream(streamId: StreamId): void {
    const s = this._requireStream(streamId);
    if (s.state !== 'open') {
      return;
    }
    this._sink.write(encodeMuxRecord(streamId, MuxFlag.END, new Uint8Array(0)));
    s.state = 'half-closed';
  }

  /** Abort a stream immediately. */
  resetStream(streamId: StreamId): void {
    const s = this._streams.get(streamId);
    if (!s || s.state === 'closed' || s.state === 'reset') {
      return;
    }
    this._sink.write(encodeMuxRecord(streamId, MuxFlag.RST, new Uint8Array(0)));
    s.state = 'reset';
  }

  streamState(streamId: StreamId): StreamState | undefined {
    return this._streams.get(streamId)?.state;
  }

  streamStats(streamId: StreamId): { bytesSent: number; recordsSent: number } | undefined {
    const s = this._streams.get(streamId);
    return s ? { bytesSent: s.bytesSent, recordsSent: s.recordsSent } : undefined;
  }

  get openStreamCount(): number {
    let n = 0;
    for (const s of this._streams.values()) {
      if (s.state === 'open') n++;
    }
    return n;
  }

  private _requireStream(id: StreamId): LogicalStream {
    const s = this._streams.get(id);
    if (!s) {
      // Auto-register externally-assigned ids (peer-initiated streams
      // demuxed locally, or caller-managed ids).
      const created: LogicalStream = { id, state: 'open', bytesSent: 0, recordsSent: 0 };
      this._streams.set(id, created);
      return created;
    }
    return s;
  }
}
