/**
 * Transport engine tests — adapters (loopback, socket stub, chunked
 * HTTP, SSE, WebSocket), backpressure write queue, stream scheduling,
 * multiplexing, graceful shutdown, metrics.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  LoopbackAdapter,
  SocketStubAdapter,
  ChunkedHttpAdapter,
  SseAdapter,
  WebSocketAdapter,
} from '../engine/adapters';
import { CollectingByteSink } from '../engine/TransportEngine';
import { BackpressureWriteQueue } from '../engine/BackpressureWriteQueue';
import { StreamScheduler, sliceChunks } from '../engine/StreamScheduler';
import {
  StreamMultiplexer,
  MuxDecoder,
  encodeMuxRecord,
} from '../engine/StreamMultiplexer';
import { TransportEngine } from '../engine/TransportEngine';
import { LatencyHistogram } from '../engine/metrics';
import { FrameCodec } from '../../websocket/protocol/FrameCodec';
import { WsOpcode } from '../../websocket/protocol/types';
import type { TransportClock } from '../engine/types';
import {
  QueueFullError,
  TransportClosedError,
  DrainTimeoutError,
} from '../engine/types';

class FakeClock implements TransportClock {
  t = 5_000_000;
  now(): number {
    return this.t;
  }
  advance(ms: number): void {
    this.t += ms;
  }
}

const enc = new TextEncoder();
const u8 = (s: string): Uint8Array => enc.encode(s);

/* ================================================================== */
/* Adapters                                                            */
/* ================================================================== */

describe('adapters', () => {
  let sink: CollectingByteSink;
  beforeEach(() => {
    sink = new CollectingByteSink();
  });

  it('loopback passes bytes through verbatim', () => {
    const a = new LoopbackAdapter(sink);
    a.start();
    a.write(u8('hello '));
    a.write(u8('world'));
    a.end();
    expect(sink.collectedText()).toBe('hello world');
    expect(a.receivedText).toBe('hello world');
    expect(a.bytesWritten).toBe(11);
  });

  it('socket stub segments large writes', () => {
    const a = new SocketStubAdapter(sink, { segmentSize: 4 });
    a.start();
    a.write(u8('0123456789'));
    // bytesWritten counts wire bytes, not segment count; the sink got
    // 3 segments (4+4+2) — verify via collected length & reassembly.
    expect(sink.collectedText()).toBe('0123456789');
    expect(a.bytesWritten).toBe(10);
  });

  it('chunked http frames chunks with hex lengths', () => {
    const a = new ChunkedHttpAdapter(sink);
    a.start();
    a.write(u8('abc'));
    a.write(u8('de'));
    a.end();
    expect(sink.collectedText()).toBe('3\r\nabc\r\n2\r\nde\r\n0\r\n\r\n');
  });

  it('chunked http emits trailers before final CRLF', () => {
    const a = new ChunkedHttpAdapter(sink);
    a.start();
    a.write(u8('x'));
    a.end({ 'X-Checksum': 'ff', Expires: 'never' });
    const out = sink.collectedText();
    expect(out).toBe('1\r\nx\r\n0\r\nX-Checksum: ff\r\nExpires: never\r\n\r\n');
  });

  it('chunked http splits large writes at wireChunkSize', () => {
    const a = new ChunkedHttpAdapter(sink, 3);
    a.start();
    a.write(u8('12345678'));
    a.end();
    expect(sink.collectedText()).toBe(
      '3\r\n123\r\n3\r\n456\r\n2\r\n78\r\n0\r\n\r\n'
    );
  });

  it('sse formats events with event/id/retry fields', () => {
    const a = new SseAdapter(sink);
    a.start();
    a.sendEvent({ data: 'line1\nline2', event: 'upd', id: '7', retry: 500 });
    expect(sink.collectedText()).toBe(
      'event: upd\nid: 7\nretry: 500\ndata: line1\ndata: line2\n\n'
    );
  });

  it('sse write() treats bytes as message data', () => {
    const a = new SseAdapter(sink);
    a.start();
    a.write(u8('tick'));
    a.sendComment('keep-alive');
    expect(sink.collectedText()).toBe('data: tick\n\n: keep-alive\n\n');
  });

  it('websocket adapter emits decodable frames', () => {
    const a = new WebSocketAdapter(sink, { opcode: WsOpcode.TEXT });
    a.start();
    a.write(u8('hi'));
    a.end();
    const codec = new FrameCodec();
    const frames = codec.feed(Buffer.from(sink.collected()));
    expect(frames).toHaveLength(2);
    expect(frames[0]!.opcode).toBe(WsOpcode.TEXT);
    expect(frames[0]!.payload.toString()).toBe('hi');
    expect(frames[1]!.opcode).toBe(WsOpcode.CLOSE);
  });

  it('websocket adapter fragments large payloads', () => {
    const a = new WebSocketAdapter(sink, { fragmentAt: 4 });
    a.start();
    a.write(u8('0123456789'));
    const codec = new FrameCodec();
    const frames = codec.feed(Buffer.from(sink.collected()));
    // 4+4+2 = 3 fragments: first BINARY, then CONTINUATION×2
    expect(frames).toHaveLength(3);
    expect(frames[0]!.opcode).toBe(WsOpcode.BINARY);
    expect(frames[1]!.opcode).toBe(WsOpcode.CONTINUATION);
    expect(frames[2]!.fin).toBe(true);
    const reassembled = Buffer.concat(frames.map((f) => f.payload));
    expect(reassembled.toString()).toBe('0123456789');
  });

  it('write after end throws TransportClosedError', () => {
    const a = new LoopbackAdapter(sink);
    a.start();
    a.end();
    expect(() => a.write(u8('x'))).toThrow(TransportClosedError);
  });
});

/* ================================================================== */
/* BackpressureWriteQueue                                              */
/* ================================================================== */

describe('BackpressureWriteQueue', () => {
  let sink: CollectingByteSink;
  let adapter: LoopbackAdapter;
  beforeEach(() => {
    sink = new CollectingByteSink();
    adapter = new LoopbackAdapter(sink);
    adapter.start();
  });

  it('writes through when adapter writable', async () => {
    const q = new BackpressureWriteQueue(adapter, {
      highWaterMark: 1024,
      lowWaterMark: 256,
    });
    const { result, flushed } = q.enqueue(u8('abc'));
    expect(result.accepted).toBe(true);
    expect(result.backpressured).toBe(false);
    await flushed;
    expect(sink.collectedText()).toBe('abc');
  });

  it('queues when adapter paused, drains FIFO on resume', async () => {
    // Adapter accepts bytes (Node semantics: false = "accepted but
    // stop sending") while `refusing` is true; a manual gate lets the
    // test resume it. Chunks are never dropped on refusal.
    const gate = {
      refusing: false,
      drainCb: (() => {}) as () => void,
    };
    const fakeAdapter = {
      name: 'fake',
      open: true,
      bytesWritten: 0,
      start: () => undefined,
      write: (chunk: Uint8Array): boolean => {
        sink.write(chunk); // chunk IS accepted even when refusing
        return !gate.refusing;
      },
      end: () => undefined,
      abort: () => undefined,
      onDrain: (cb: () => void) => {
        gate.drainCb = cb;
      },
    };
    const q = new BackpressureWriteQueue(fakeAdapter, {
      highWaterMark: 8,
      lowWaterMark: 4,
    });
    gate.refusing = true;
    q.enqueue(u8('aa')); // write-through, adapter pauses after
    expect(q.paused).toBe(true);
    q.enqueue(u8('bb'));
    q.enqueue(u8('cccc')); // queued = 6 < hwm 8
    const r = q.enqueue(u8('dd')); // queued = 8 ≥ hwm → backpressured
    expect(r.result.backpressured).toBe(true);
    expect(q.pendingChunks).toBe(3);

    // Drain fires: adapter delivers 'bb' then refuses again — FIFO
    // consumption continues only while the adapter reports writable.
    gate.drainCb();
    expect(q.pendingChunks).toBe(2);
    expect(sink.collectedText()).toBe('aabb');

    // Fully resume → drains 'cccc' and 'dd'.
    gate.refusing = false;
    gate.drainCb();
    expect(q.pendingChunks).toBe(0);
    expect(sink.collectedText()).toBe('aabbccccdd');
  });

  it('fires drain callbacks when queue drops below low water mark', async () => {
    const gate = {
      writable: true,
      cb: (() => {}) as () => void,
    };
    const fakeAdapter = {
      name: 'fake',
      open: true,
      bytesWritten: 0,
      start: () => undefined,
      write: (chunk: Uint8Array): boolean => {
        // Always accept (record) the chunk; `writable` only controls
        // the go-ahead signal for subsequent writes.
        sink.write(chunk);
        return gate.writable;
      },
      end: () => undefined,
      abort: () => undefined,
      onDrain: (cb: () => void) => {
        gate.cb = cb;
      },
    };
    const q = new BackpressureWriteQueue(fakeAdapter, {
      highWaterMark: 10,
      lowWaterMark: 5,
    });
    // First write goes through; make adapter refuse from now on.
    q.enqueue(u8('aaaaa'));
    gate.writable = false;
    q.enqueue(u8('bbbbb')); // pauses adapter
    q.enqueue(u8('ccc')); // queued = 3
    // Resume the adapter → drains all three queued chunks.
    gate.writable = true;
    gate.cb();
    expect(q.queuedBytes).toBe(0);
    expect(sink.collectedText()).toBe('aaaaabbbbbccc');
  });

  it('rejects with QueueFullError over maxQueuedBytes', () => {
    const fakeAdapter = {
      name: 'fake',
      open: true,
      bytesWritten: 0,
      start: () => undefined,
      write: () => false, // always refuse
      end: () => undefined,
      abort: () => undefined,
      onDrain: () => undefined,
    };
    const q = new BackpressureWriteQueue(fakeAdapter, {
      highWaterMark: 4,
      lowWaterMark: 2,
      maxQueuedBytes: 8,
    });
    q.enqueue(u8('aa')); // write-through (refused → paused)
    q.enqueue(u8('bbbb')); // queued 4
    expect(() => q.enqueue(u8('ccccc'))).toThrow(QueueFullError); // 4+5 > 8
  });
});

/* ================================================================== */
/* StreamScheduler                                                     */
/* ================================================================== */

describe('StreamScheduler', () => {
  it('sliceChunks splits at boundaries', () => {
    const chunks = sliceChunks(u8('0123456789'), 4);
    expect(chunks.map((c) => new TextDecoder().decode(c))).toEqual([
      '0123',
      '4567',
      '89',
    ]);
  });

  it('streams a payload in scheduled chunks', async () => {
    const sink = new CollectingByteSink();
    const adapter = new LoopbackAdapter(sink);
    adapter.start();
    const q = new BackpressureWriteQueue(adapter, {
      highWaterMark: 1 << 20,
      lowWaterMark: 1 << 19,
    });
    const sched = new StreamScheduler(q, {
      chunkSize: 4,
      chunksPerTick: 2,
      schedule: (fn) => setTimeout(fn, 0),
    });
    const handle = sched.stream(u8('0123456789'));
    const result = await handle.done;
    expect(result.chunksWritten).toBe(3);
    expect(result.bytesWritten).toBe(10);
    expect(sink.collectedText()).toBe('0123456789');
  });

  it('cancel stops further chunks', async () => {
    const sink = new CollectingByteSink();
    const adapter = new LoopbackAdapter(sink);
    adapter.start();
    const q = new BackpressureWriteQueue(adapter, {
      highWaterMark: 1 << 20,
      lowWaterMark: 1 << 19,
    });
    // Schedule via a controllable pump so we can cancel mid-stream.
    const pending: (() => void)[] = [];
    const sched = new StreamScheduler(q, {
      chunkSize: 2,
      chunksPerTick: 1,
      schedule: (fn) => pending.push(fn),
    });
    const handle = sched.stream(u8('aabbccdd'));
    pending.shift()!(); // tick → writes 'aa', schedules next
    handle.cancel('test');
    pending.shift()!(); // tick → sees cancelled
    const result = await handle.done;
    expect(result.cancelled).toBe(true);
    expect(result.chunksWritten).toBe(1);
  });
});

/* ================================================================== */
/* StreamMultiplexer                                                   */
/* ================================================================== */

describe('StreamMultiplexer + MuxDecoder', () => {
  let sink: CollectingByteSink;
  beforeEach(() => {
    sink = new CollectingByteSink();
  });

  it('encodes and decodes records round-trip', () => {
    const mux = new StreamMultiplexer(sink);
    const s1 = mux.openStream();
    const s2 = mux.openStream();
    mux.send(s1, u8('hello'));
    mux.send(s2, u8('world'));
    mux.send(s1, u8(' again'));
    mux.closeStream(s1);

    const dec = new MuxDecoder();
    const records = dec.feed(sink.collected());
    // records: OPEN s1, OPEN s2, data s1, data s2, data s1, END s1
    const data = records.filter((r) => r.payload.byteLength > 0);
    expect(data.map((r) => new TextDecoder().decode(r.payload))).toEqual([
      'hello',
      'world',
      ' again',
    ]);
    expect(data[0]!.streamId).toBe(s1);
    expect(data[1]!.streamId).toBe(s2);
    const end = records.find((r) => (r.flags & 0x2) !== 0 && r.payload.byteLength === 0 && r.streamId === s1);
    expect(end).toBeDefined();
    expect(mux.openStreamCount).toBe(1);
  });

  it('decoder tolerates partial header/payload delivery', () => {
    const record = encodeMuxRecord(7, 0, u8('chunky'));
    const dec = new MuxDecoder();
    const r1 = dec.feed(record.subarray(0, 5)); // partial header
    expect(r1).toHaveLength(0);
    const r2 = dec.feed(record.subarray(5, 10)); // header + partial payload
    expect(r2).toHaveLength(0);
    const r3 = dec.feed(record.subarray(10));
    expect(r3).toHaveLength(1);
    expect(r3[0]!.streamId).toBe(7);
    expect(new TextDecoder().decode(r3[0]!.payload)).toBe('chunky');
  });

  it('send on closed stream throws', () => {
    const mux = new StreamMultiplexer(sink);
    const s = mux.openStream();
    mux.closeStream(s);
    expect(() => mux.send(s, u8('x'))).toThrow();
  });

  it('reset marks stream reset', () => {
    const mux = new StreamMultiplexer(sink);
    const s = mux.openStream();
    mux.resetStream(s);
    expect(mux.streamState(s)).toBe('reset');
  });
});

/* ================================================================== */
/* LatencyHistogram                                                    */
/* ================================================================== */

describe('LatencyHistogram', () => {
  it('computes nearest-rank percentiles', () => {
    const h = new LatencyHistogram(100);
    for (let i = 1; i <= 100; i++) {
      h.record(i);
    }
    const snap = h.snapshot();
    expect(snap.count).toBe(100);
    expect(snap.min).toBe(1);
    expect(snap.max).toBe(100);
    expect(snap.p50).toBe(50);
    expect(snap.p90).toBe(90);
    expect(snap.p99).toBe(99);
  });

  it('evicts oldest samples beyond capacity', () => {
    const h = new LatencyHistogram(3);
    h.record(1);
    h.record(2);
    h.record(3);
    h.record(100);
    expect(h.count).toBe(3);
    expect(h.percentile(100)).toBe(100);
    expect(h.snapshot().min).toBe(2); // 1 was evicted
  });
});

/* ================================================================== */
/* TransportEngine                                                     */
/* ================================================================== */

describe('TransportEngine', () => {
  let sink: CollectingByteSink;
  let clock: FakeClock;

  function makeEngine(
    sinkOverride?: CollectingByteSink,
    queueOpts?: Partial<{ highWaterMark: number; lowWaterMark: number; maxQueuedBytes: number }>
  ): { engine: TransportEngine; adapter: LoopbackAdapter; sink: CollectingByteSink } {
    const s = sinkOverride ?? new CollectingByteSink();
    const adapter = new LoopbackAdapter(s);
    const engine = new TransportEngine(adapter, {
      clock,
      queue: {
        highWaterMark: queueOpts?.highWaterMark ?? 1 << 20,
        lowWaterMark: queueOpts?.lowWaterMark ?? 1 << 19,
        maxQueuedBytes: queueOpts?.maxQueuedBytes,
      },
      scheduler: { schedule: (fn) => setTimeout(fn, 0) },
    });
    engine.start();
    return { engine, adapter, sink: s };
  }

  beforeEach(() => {
    sink = new CollectingByteSink();
    clock = new FakeClock();
  });

  it('send writes bytes and records metrics', async () => {
    const { engine, adapter } = makeEngine(sink);
    clock.advance(3);
    const writable = await engine.send('hello');
    expect(writable).toBe(true);
    expect(sink.collectedText()).toBe('hello');
    expect(adapter.bytesWritten).toBe(5);
    const m = engine.metrics();
    expect(m.writes).toBe(1);
    expect(m.bytesOut).toBe(5);
    expect(m.writeLatency.count).toBe(1);
    expect(m.writeLatency.max).toBeLessThanOrEqual(3);
  });

  it('stream chunks a large body through the queue', async () => {
    const { engine } = makeEngine(sink);
    const payload = 'x'.repeat(5000);
    const handle = engine.stream(payload);
    const res = await handle.done;
    expect(res.bytesWritten).toBe(5000);
    expect(sink.collectedText()).toBe(payload);
  });

  it('multiplexed streams interleave over one transport', async () => {
    const { engine } = makeEngine(sink);
    const mux = engine.createMultiplexer();
    const s1 = mux.openStream();
    const s2 = mux.openStream();
    mux.send(s1, u8('a1'));
    mux.send(s2, u8('b2'));
    mux.closeStream(s1);
    const dec = new MuxDecoder();
    const records = dec.feed(sink.collected());
    const data = records.filter((r) => r.payload.byteLength > 0);
    expect(data).toHaveLength(2);
    expect(data[0]!.streamId).toBe(s1);
    expect(data[1]!.streamId).toBe(s2);
    const m = engine.metrics();
    expect(m.openStreams).toBe(1); // s2 still open
  });

  it('graceful shutdown drains then ends', async () => {
    const { engine, adapter } = makeEngine(sink);
    await engine.send('data');
    await engine.shutdown();
    expect(engine.isShutdown).toBe(true);
    expect(adapter.open).toBe(false);
    await expect(engine.send('late')).rejects.toThrow(TransportClosedError);
  });

  it('shutdown writes trailers for chunked adapter', async () => {
    const chunkedSink = new CollectingByteSink();
    const adapter = new ChunkedHttpAdapter(chunkedSink);
    const engine = new TransportEngine(adapter, {
      clock,
      queue: { highWaterMark: 1 << 20, lowWaterMark: 1 << 19 },
    });
    engine.start();
    await engine.send('body');
    await engine.shutdown({ 'X-Digest': 'abc' });
    expect(chunkedSink.collectedText()).toBe(
      '4\r\nbody\r\n0\r\nX-Digest: abc\r\n\r\n'
    );
  });

  it('shutdown times out when queue cannot drain', async () => {
    // Adapter that always refuses → queue can never drain.
    const stuckAdapter = {
      name: 'stuck',
      open: true,
      bytesWritten: 0,
      start: () => undefined,
      write: () => false,
      end: () => undefined,
      abort: () => undefined,
      onDrain: () => undefined,
    };
    const engine = new TransportEngine(stuckAdapter, {
      clock,
      queue: { highWaterMark: 1 << 20, lowWaterMark: 1 << 19 },
      drainTimeoutMs: 20,
    });
    engine.start();
    const sendP = engine.send('x').catch((e) => e); // flushed rejects on abort
    const shutP = engine.shutdown(undefined, 20);
    await expect(shutP).rejects.toThrow(DrainTimeoutError);
    await sendP;
  });

  it('abort rejects pending writes immediately', async () => {
    // First write is accepted (adapter buffers it, returns false →
    // pause); second write queues behind the pause. Abort must reject
    // the QUEUED write's flushed promise without touching the first.
    const stuckAdapter = {
      name: 'stuck',
      open: true,
      bytesWritten: 0,
      start: () => undefined,
      write: () => false, // accepted but "stop sending"
      end: () => undefined,
      abort: () => undefined,
      onDrain: () => undefined,
    };
    const engine = new TransportEngine(stuckAdapter, {
      clock,
      queue: { highWaterMark: 1 << 20, lowWaterMark: 1 << 19 },
    });
    engine.start();
    const first = engine.send('x'); // write-through, adapter pauses
    const second = engine.send('y'); // queued behind pause
    const secondFlushed = second.catch((e) => e);
    engine.abort('test abort');
    await expect(first).resolves.toBeDefined(); // already delivered
    const err = await secondFlushed;
    expect(err).toBeInstanceOf(Error);
    expect(engine.isShutdown).toBe(true);
  });

  it('metrics track bytesIn via receive', async () => {
    const { engine } = makeEngine(sink);
    engine.receive(u8('inbound'), (b) => {
      expect(b.byteLength).toBe(7);
    });
    expect(engine.metrics().bytesIn).toBe(7);
  });
});
