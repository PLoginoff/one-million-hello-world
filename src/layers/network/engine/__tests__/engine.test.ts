/**
 * Network Engine — unit tests.
 *
 * Uses `ManualEngineClock` for every time-dependent path so tests are
 * deterministic; factories are small fakes rather than mocks so the
 * pool's real bookkeeping is exercised end to end.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  ConnectionPool,
  SocketBackpressure,
  TlsTermination,
  Http2FrameCodec,
  KeepAliveTracker,
  FlowWindow,
  ManualEngineClock,
  QueueFullError,
  SinkClosedError,
  PoolClosedError,
  AcquireTimeoutError,
  TlsHandshakeError,
  FrameSizeError,
  Http2ProtocolError,
  TlsState,
  TlsContentType,
  TlsHandshakeType,
  Http2FrameType,
  Http2Flag,
  HTTP2_DEFAULT_MAX_FRAME,
  HTTP2_MAX_WINDOW,
  ByteSink,
  PooledConnection,
  PooledConnectionFactory,
} from '../index';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

interface FakeConn extends PooledConnection {
  destroyed: boolean;
  valid: boolean;
}

function makeFactory(opts: {
  failValidate?: boolean;
  failCreate?: boolean;
} = {}): PooledConnectionFactory<FakeConn> & {
  created: FakeConn[];
  destroyed: FakeConn[];
} {
  let n = 0;
  const created: FakeConn[] = [];
  const destroyed: FakeConn[] = [];
  return {
    created,
    destroyed,
    create() {
      if (opts.failCreate) {
        throw new Error('create failed');
      }
      const c: FakeConn = { id: `c${++n}`, destroyed: false, valid: true };
      created.push(c);
      return c;
    },
    validate(c) {
      return opts.failValidate ? false : c.valid;
    },
    destroy(c) {
      c.destroyed = true;
      destroyed.push(c);
    },
  };
}

/**
 * Sink that accepts `acceptCount` writes, then returns false until
 * `openDrain` — modelling the kernel-buffer-full then drain-event
 * contract. `setAccepts(0)` makes the very next write refuse.
 */
class TestSink implements ByteSink {
  readonly written: Uint8Array[] = [];
  private _accepts = Infinity;
  private _drainCbs: (() => void)[] = [];
  closed = false;

  write(chunk: Uint8Array): boolean {
    if (this.closed) throw new Error('closed');
    // Node semantics: a `false` return still buffers the chunk — the
    // caller is told to stop producing, not that the write was lost.
    this.written.push(chunk);
    if (this._accepts <= 0) {
      return false;
    }
    this._accepts--;
    return true;
  }
  /** Writes accepted before the sink starts refusing. */
  setAccepts(n: number) {
    this._accepts = n;
  }
  openDrain() {
    const cbs = this._drainCbs.splice(0);
    for (const cb of cbs) cb();
  }
  onDrain(cb: () => void) {
    this._drainCbs.push(cb);
  }
  end() {
    this.closed = true;
  }
}

function rec(type: TlsContentType, firstByte = 0, len = 4) {
  const frag = new Uint8Array(len);
  frag[0] = firstByte;
  return { contentType: type, version: 0x0303, fragment: frag };
}

function h2frame(
  type: number,
  streamId: number,
  payload: number[] = [],
  flags = 0
): Uint8Array {
  const out = new Uint8Array(9 + payload.length);
  const len = payload.length;
  out[0] = (len >> 16) & 0xff;
  out[1] = (len >> 8) & 0xff;
  out[2] = len & 0xff;
  out[3] = type;
  out[4] = flags;
  out[5] = (streamId >> 24) & 0x7f;
  out[6] = (streamId >> 16) & 0xff;
  out[7] = (streamId >> 8) & 0xff;
  out[8] = streamId & 0xff;
  out.set(payload, 9);
  return out;
}

/* ------------------------------------------------------------------ */
/* ConnectionPool                                                      */
/* ------------------------------------------------------------------ */

describe('ConnectionPool', () => {
  let clock: ManualEngineClock;
  let factory: ReturnType<typeof makeFactory>;

  beforeEach(() => {
    clock = new ManualEngineClock();
    factory = makeFactory();
  });

  it('warms up to minIdle on start', async () => {
    const pool = new ConnectionPool(factory, { minIdle: 3, clock });
    await pool.start();
    expect(pool.stats.idle).toBe(3);
    expect(factory.created.length).toBe(3);
  });

  it('acquires idle connections before creating new ones', async () => {
    const pool = new ConnectionPool(factory, { minIdle: 1, clock });
    await pool.start();
    const c1 = await pool.acquire();
    expect(c1.id).toBe('c1');
    expect(factory.created.length).toBe(1);
    await pool.release(c1);
    const c2 = await pool.acquire();
    expect(c2.id).toBe('c1'); // reused, not recreated
    expect(factory.created.length).toBe(1);
  });

  it('creates on demand up to maxSize then queues waiters', async () => {
    const pool = new ConnectionPool(factory, {
      maxSize: 2,
      acquireTimeoutMs: 0,
      clock,
    });
    const a = await pool.acquire();
    const b = await pool.acquire();
    expect(pool.stats.checkedOut).toBe(2);

    let thirdResolved = false;
    const p3 = pool.acquire().then((c) => {
      thirdResolved = true;
      return c;
    });
    await Bun.sleep(0); // let microtasks run — must not resolve yet
    expect(thirdResolved).toBe(false);
    expect(pool.stats.waiters).toBe(1);

    await pool.release(a);
    const c3 = await p3;
    expect(thirdResolved).toBe(true);
    expect(c3.id).toBe(a.id); // waiter got the released conn
    await pool.release(b);
    await pool.release(c3);
  });

  it('revalidates idle connections on checkout', async () => {
    const pool = new ConnectionPool(factory, { minIdle: 1, clock });
    await pool.start();
    // Poison the only idle conn.
    factory.created[0].valid = false;
    const c = await pool.acquire();
    expect(pool.stats.failedValidations).toBe(1);
    expect(factory.destroyed.length).toBe(1);
    expect(c.id).not.toBe('c1'); // got a fresh one instead
  });

  it('skips validation when validateOnCheckout is false', async () => {
    const pool = new ConnectionPool(factory, {
      minIdle: 1,
      validateOnCheckout: false,
      clock,
    });
    await pool.start();
    factory.created[0].valid = false;
    const c = await pool.acquire();
    expect(c.id).toBe('c1');
    expect(pool.stats.failedValidations).toBe(0);
  });

  it('evicts idle connections past idleTimeoutMs on sweep', async () => {
    const pool = new ConnectionPool(factory, {
      minIdle: 0,
      idleTimeoutMs: 1000,
      clock,
    });
    const c = await pool.acquire();
    await pool.release(c);
    expect(pool.stats.idle).toBe(1);

    clock.advance(999);
    expect(await pool.sweep()).toBe(0);

    clock.advance(1);
    expect(await pool.sweep()).toBe(1);
    expect(pool.stats.idle).toBe(0);
    expect(pool.stats.evictedIdle).toBe(1);
    expect(factory.destroyed.length).toBe(1);
  });

  it('retires connections past maxLifetimeMs even while checked out', async () => {
    const pool = new ConnectionPool(factory, {
      maxLifetimeMs: 5000,
      clock,
    });
    const c = await pool.acquire();
    clock.advance(5000);
    await pool.release(c);
    expect(pool.stats.evictedLifetime).toBe(1);
    expect(factory.destroyed.length).toBe(1);
    expect(pool.stats.idle).toBe(0);
  });

  it('destroys checked-out conns on close instead of pooling them', async () => {
    const pool = new ConnectionPool(factory, { clock });
    const c = await pool.acquire();
    await pool.close();
    expect(pool.closed).toBe(true);
    await pool.release(c); // release-after-close must destroy, not pool
    expect(factory.destroyed.length).toBe(1);
    await expect(pool.acquire()).rejects.toBeInstanceOf(PoolClosedError);
  });

  it('rejects pending waiters on close', async () => {
    const pool = new ConnectionPool(factory, {
      maxSize: 1,
      acquireTimeoutMs: 0,
      clock,
    });
    await pool.acquire();
    const pending = pool.acquire();
    await pool.close();
    await expect(pending).rejects.toBeInstanceOf(PoolClosedError);
  });

  it('destroyCheckedOut frees capacity for a waiter', async () => {
    const pool = new ConnectionPool(factory, {
      maxSize: 1,
      acquireTimeoutMs: 0,
      clock,
    });
    const c = await pool.acquire();
    const p = pool.acquire();
    await Bun.sleep(0);
    await pool.destroyCheckedOut(c);
    const c2 = await p;
    expect(c2.id).toBe('c2');
    expect(factory.destroyed.length).toBe(1);
  });

  it('expires waiters whose deadline passes (manual clock, lazy path)', async () => {
    const pool = new ConnectionPool(factory, {
      maxSize: 1,
      acquireTimeoutMs: 1000,
      clock,
    });
    const c = await pool.acquire();
    const p = pool.acquire();
    clock.advance(2000);
    // The deadline only gets checked when a release looks for waiters.
    await pool.release(c);
    await expect(p).rejects.toBeInstanceOf(AcquireTimeoutError);
    expect(pool.stats.acquireTimeouts).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* SocketBackpressure                                                  */
/* ------------------------------------------------------------------ */

describe('SocketBackpressure', () => {
  let sink: TestSink;
  let bp: SocketBackpressure;

  beforeEach(() => {
    sink = new TestSink();
    bp = new SocketBackpressure(sink, {
      highWaterMark: 100,
      lowWaterMark: 20,
      maxQueuedBytes: 500,
    });
  });

  it('writes through when the sink is writable', async () => {
    const r = bp.write(new Uint8Array(10));
    expect(r.backpressured).toBe(false);
    expect(sink.written.length).toBe(1);
    await r.flushed;
  });

  it('queues when the sink pauses, drains in FIFO order', async () => {
    bp.write(new Uint8Array(0)); // write-through, accepted
    sink.setAccepts(0); // next write returns false → controller pauses
    const r1 = bp.write(new Uint8Array([1])); // buffered by sink, pauses us
    const r2 = bp.write(new Uint8Array([2])); // queued
    const r3 = bp.write(new Uint8Array([3])); // queued
    expect(bp.queuedBytes).toBe(2);
    expect(sink.written.length).toBe(2); // 0-byte + the false-returned one

    sink.setAccepts(Infinity);
    sink.openDrain();
    await Promise.all([r1.flushed, r2.flushed, r3.flushed]);
    expect(sink.written.length).toBe(4);
    expect(bp.queuedBytes).toBe(0);
    // FIFO preserved through the queue.
    expect(sink.written[2][0]).toBe(2);
    expect(sink.written[3][0]).toBe(3);
  });

  it('reports backpressured at/above highWaterMark', () => {
    sink.setAccepts(0);
    bp.write(new Uint8Array(1)); // pauses (write-through returned false)
    const r = bp.write(new Uint8Array(100));
    expect(r.backpressured).toBe(true);
  });

  it('hysteresis: drain fires only after dropping to lowWaterMark', async () => {
    sink.setAccepts(0);
    bp.write(new Uint8Array(1)); // pause
    for (let i = 0; i < 10; i++) {
      bp.write(new Uint8Array(10)); // 100 queued = at HWM
    }
    let drains = 0;
    bp.onDrain(() => drains++);

    sink.setAccepts(Infinity);
    sink.openDrain();
    await bp.waitForDrain();
    expect(bp.queuedBytes).toBe(0);
    expect(drains).toBeGreaterThanOrEqual(1);
  });

  it('throws QueueFullError when maxQueuedBytes is exceeded', () => {
    sink.setAccepts(0);
    bp.write(new Uint8Array(1)); // pause
    bp.write(new Uint8Array(400)); // queued: 400
    expect(() => bp.write(new Uint8Array(200))).toThrow(QueueFullError);
  });

  it('write-through errors reject the flushed promise, not throw', async () => {
    sink.end();
    const r = bp.write(new Uint8Array(1));
    await expect(r.flushed).rejects.toThrow();
  });

  it('end() closes the sink and rejects further writes', () => {
    bp.end();
    expect(sink.closed).toBe(true);
    expect(() => bp.write(new Uint8Array(1))).toThrow(SinkClosedError);
  });

  it('waitForDrain resolves immediately on an idle queue', async () => {
    await bp.waitForDrain(); // must not hang
  });

  it('tracks write/queue byte counters separately', () => {
    bp.write(new Uint8Array(10)); // through
    sink.setAccepts(0);
    bp.write(new Uint8Array(5)); // through too — the pause affects NEXT writes
    bp.write(new Uint8Array(7)); // queued now that we're paused
    expect(bp.totalBytesWritten).toBe(15);
    expect(bp.totalBytesQueued).toBe(7);
  });
});

/* ------------------------------------------------------------------ */
/* TlsTermination                                                      */
/* ------------------------------------------------------------------ */

describe('TlsTermination', () => {
  let clock: ManualEngineClock;
  let tls: TlsTermination;

  beforeEach(() => {
    clock = new ManualEngineClock();
    tls = new TlsTermination({ clock, handshakeTimeoutMs: 5000 });
  });

  it('walks the happy path: CH → flight → Finished → established', () => {
    tls.receive(rec(TlsContentType.HANDSHAKE, TlsHandshakeType.CLIENT_HELLO));
    expect(tls.state).toBe(TlsState.CLIENT_HELLO);
    tls.markServerFlightSent();
    expect(tls.state).toBe(TlsState.SERVER_FLIGHT);
    tls.receive(rec(TlsContentType.HANDSHAKE, TlsHandshakeType.FINISHED));
    expect(tls.state).toBe(TlsState.ESTABLISHED);
    expect(tls.established).toBe(true);
  });

  it('rejects non-ClientHello as the first record (plaintext on TLS port)', () => {
    expect(() => tls.receive(rec(TlsContentType.APPLICATION_DATA, 0))).toThrow(
      TlsHandshakeError
    );
    expect(() => tls.receive(rec(TlsContentType.HANDSHAKE, 99))).toThrow(
      TlsHandshakeError
    );
  });

  it('fails on application data before handshake completes', () => {
    tls.receive(rec(TlsContentType.HANDSHAKE, TlsHandshakeType.CLIENT_HELLO));
    expect(() => tls.receive(rec(TlsContentType.APPLICATION_DATA, 0))).toThrow(
      TlsHandshakeError
    );
    expect(tls.state).toBe(TlsState.FAILED);
  });

  it('accepts app data after establishment and counts it', () => {
    tls.receive(rec(TlsContentType.HANDSHAKE, TlsHandshakeType.CLIENT_HELLO));
    tls.markServerFlightSent();
    tls.receive(rec(TlsContentType.HANDSHAKE, TlsHandshakeType.FINISHED));
    tls.receive(rec(TlsContentType.APPLICATION_DATA, 0, 100));
    tls.receive(rec(TlsContentType.APPLICATION_DATA, 0, 50));
    expect(tls.appDataRecords).toBe(2);
  });

  it('close_notify transitions to CLOSED only after established', () => {
    tls.receive(rec(TlsContentType.HANDSHAKE, TlsHandshakeType.CLIENT_HELLO));
    tls.markServerFlightSent();
    tls.receive(rec(TlsContentType.HANDSHAKE, TlsHandshakeType.FINISHED));
    const alert = new Uint8Array([2, 0]); // fatal close_notify
    const ev = tls.receive({
      contentType: TlsContentType.ALERT,
      version: 0x0303,
      fragment: alert,
    });
    expect(ev.state).toBe(TlsState.CLOSED);
    expect(() =>
      tls.receive(rec(TlsContentType.APPLICATION_DATA))
    ).toThrow(TlsHandshakeError);
  });

  it('times out a stalled handshake', () => {
    tls.receive(rec(TlsContentType.HANDSHAKE, TlsHandshakeType.CLIENT_HELLO));
    clock.advance(6000);
    expect(tls.handshakeTimedOut).toBe(true);
    expect(() =>
      tls.receive(rec(TlsContentType.HANDSHAKE, TlsHandshakeType.FINISHED))
    ).toThrow(TlsHandshakeError);
    expect(tls.state).toBe(TlsState.FAILED);
  });

  it('bounds handshake records (DoS guard)', () => {
    const t = new TlsTermination({ clock, maxHandshakeRecords: 3 });
    t.receive(rec(TlsContentType.HANDSHAKE, TlsHandshakeType.CLIENT_HELLO));
    t.receive(rec(TlsContentType.HANDSHAKE, 0)); // tolerated noise
    t.receive(rec(TlsContentType.HANDSHAKE, 0));
    expect(() => t.receive(rec(TlsContentType.HANDSHAKE, 0))).toThrow(
      TlsHandshakeError
    );
  });

  it('permits post-handshake NewSessionTicket but not a second ClientHello', () => {
    tls.receive(rec(TlsContentType.HANDSHAKE, TlsHandshakeType.CLIENT_HELLO));
    tls.markServerFlightSent();
    tls.receive(rec(TlsContentType.HANDSHAKE, TlsHandshakeType.FINISHED));
    tls.receive(rec(TlsContentType.HANDSHAKE, TlsHandshakeType.NEW_SESSION_TICKET));
    expect(tls.state).toBe(TlsState.ESTABLISHED);
    expect(() =>
      tls.receive(rec(TlsContentType.HANDSHAKE, TlsHandshakeType.CLIENT_HELLO))
    ).toThrow(TlsHandshakeError);
  });

  it('emits transition events to listeners', () => {
    const events: string[] = [];
    tls.onTransition((e) => events.push(e.state));
    tls.receive(rec(TlsContentType.HANDSHAKE, TlsHandshakeType.CLIENT_HELLO));
    tls.markServerFlightSent();
    tls.receive(rec(TlsContentType.HANDSHAKE, TlsHandshakeType.FINISHED));
    expect(events).toEqual([
      TlsState.CLIENT_HELLO,
      TlsState.SERVER_FLIGHT,
      TlsState.ESTABLISHED,
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* Http2FrameCodec                                                     */
/* ------------------------------------------------------------------ */

describe('Http2FrameCodec', () => {
  let codec: Http2FrameCodec;

  beforeEach(() => {
    codec = new Http2FrameCodec({ server: false });
  });

  it('encodes then decodes a DATA frame round-trip', () => {
    const payload = new Uint8Array([1, 2, 3]);
    const wire = codec.encode({
      type: Http2FrameType.DATA,
      flags: Http2Flag.END_STREAM,
      streamId: 1,
      payload,
    });
    const dec = new Http2FrameCodec();
    dec.feed(wire);
    const f = dec.nextFrame();
    expect(f).not.toBeNull();
    expect(f!.type).toBe(Http2FrameType.DATA);
    expect(f!.streamId).toBe(1);
    expect(f!.flags).toBe(Http2Flag.END_STREAM);
    expect(Array.from(f!.payload)).toEqual([1, 2, 3]);
  });

  it('reassembles frames split across arbitrary feeds', () => {
    const wire = h2frame(Http2FrameType.PING, 0, [1, 2, 3, 4, 5, 6, 7, 8]);
    codec.feed(wire.slice(0, 5));
    expect(codec.nextFrame()).toBeNull();
    codec.feed(wire.slice(5));
    const f = codec.nextFrame();
    expect(f).not.toBeNull();
    expect(f!.type).toBe(Http2FrameType.PING);
  });

  it('decodes multiple frames from one feed', () => {
    const w1 = h2frame(Http2FrameType.PING, 0, [0, 0, 0, 0, 0, 0, 0, 0]);
    const w2 = h2frame(Http2FrameType.SETTINGS, 0, []);
    const both = new Uint8Array(w1.length + w2.length);
    both.set(w1, 0);
    both.set(w2, w1.length);
    codec.feed(both);
    expect(codec.nextFrame()?.type).toBe(Http2FrameType.PING);
    expect(codec.nextFrame()?.type).toBe(Http2FrameType.SETTINGS);
    expect(codec.nextFrame()).toBeNull();
  });

  it('rejects frames larger than maxFrameSize', () => {
    const wire = h2frame(
      Http2FrameType.DATA,
      1,
      new Array(HTTP2_DEFAULT_MAX_FRAME + 1).fill(0)
    );
    codec.feed(wire);
    expect(() => codec.nextFrame()).toThrow(FrameSizeError);
  });

  it('rejects connection-level frames with nonzero stream id', () => {
    codec.feed(h2frame(Http2FrameType.SETTINGS, 3, []));
    expect(() => codec.nextFrame()).toThrow(Http2ProtocolError);
  });

  it('rejects stream-level frames on stream 0', () => {
    codec.feed(h2frame(Http2FrameType.DATA, 0, [1]));
    expect(() => codec.nextFrame()).toThrow(Http2ProtocolError);
  });

  it('enforces CONTINUATION sequencing after HEADERS without END_HEADERS', () => {
    codec.feed(h2frame(Http2FrameType.HEADERS, 1, [0xaa], 0)); // no END_HEADERS
    codec.nextFrame();
    expect(codec.inHeaderBlock).toBe(true);
    codec.feed(h2frame(Http2FrameType.DATA, 3, [1]));
    expect(() => codec.nextFrame()).toThrow(Http2ProtocolError);
  });

  it('closes the header block when CONTINUATION carries END_HEADERS', () => {
    codec.feed(h2frame(Http2FrameType.HEADERS, 1, [0xaa], 0));
    codec.nextFrame();
    codec.feed(h2frame(Http2FrameType.CONTINUATION, 1, [0xbb], Http2Flag.END_HEADERS));
    codec.nextFrame();
    expect(codec.inHeaderBlock).toBe(false);
  });

  it('DATA consumes connection + stream flow-control windows', () => {
    codec.feed(h2frame(Http2FrameType.DATA, 1, new Array(100).fill(0)));
    codec.nextFrame();
    expect(codec.connRecvWindow.available).toBe(65_535 - 100);
    expect(codec.streamWindow(1).available).toBe(65_535 - 100);
  });

  it('throws FLOW_CONTROL_ERROR when receive window is exceeded', () => {
    codec.connRecvWindow.consume(65_535); // drain connection window
    codec.feed(h2frame(Http2FrameType.DATA, 1, [1]));
    expect(() => codec.nextFrame()).toThrow(Http2ProtocolError);
  });

  it('WINDOW_UPDATE restores send-side credit', () => {
    // Drain send window by encoding a DATA frame, then restore via an
    // inbound WINDOW_UPDATE on stream 0 (connection scope).
    codec.encode({
      type: Http2FrameType.DATA,
      flags: 0,
      streamId: 1,
      payload: new Uint8Array(1000),
    });
    expect(codec.connSendWindow.available).toBe(65_535 - 1000);
    const inc = new Uint8Array([0, 0, 0x03, 0xe8]); // +1000
    codec.feed(h2frame(Http2FrameType.WINDOW_UPDATE, 0, Array.from(inc)));
    codec.nextFrame();
    expect(codec.connSendWindow.available).toBe(65_535);
  });

  it('rejects zero-increment WINDOW_UPDATE', () => {
    codec.feed(h2frame(Http2FrameType.WINDOW_UPDATE, 1, [0, 0, 0, 0]));
    expect(() => codec.nextFrame()).toThrow(Http2ProtocolError);
  });

  it('rejects WINDOW_UPDATE exceeding the 2^31-1 ceiling', () => {
    const w = new FlowWindow(HTTP2_MAX_WINDOW - 10);
    expect(() => w.applyWindowUpdate(100, 1)).toThrow(Http2ProtocolError);
  });

  it('allocates odd stream ids for clients and even for servers', () => {
    const client = new Http2FrameCodec({ server: false });
    const server = new Http2FrameCodec({ server: true });
    expect(client.nextOutboundStreamId()).toBe(1);
    expect(client.nextOutboundStreamId()).toBe(3);
    expect(server.nextOutboundStreamId()).toBe(2);
    expect(server.nextOutboundStreamId()).toBe(4);
  });

  it('encodes SETTINGS frames round-trip', () => {
    const settings = new Map<number, number>([
      [0x3, 100], // MAX_CONCURRENT_STREAMS
      [0x4, 65_535], // INITIAL_WINDOW_SIZE
    ]);
    const wire = codec.encodeSettings(settings);
    const dec = new Http2FrameCodec();
    dec.feed(wire);
    const f = dec.nextFrame();
    expect(f!.type).toBe(Http2FrameType.SETTINGS);
    expect(f!.payload.byteLength).toBe(12);
  });
});

/* ------------------------------------------------------------------ */
/* KeepAliveTracker                                                    */
/* ------------------------------------------------------------------ */

describe('KeepAliveTracker', () => {
  let clock: ManualEngineClock;
  let tracker: KeepAliveTracker;

  beforeEach(() => {
    clock = new ManualEngineClock();
    tracker = new KeepAliveTracker({
      clock,
      maxRequests: 3,
      idleTimeoutMs: 10_000,
      maxPipelineDepth: 2,
    });
  });

  it('treats unknown connections as reusable', () => {
    const v = tracker.canReuse('nope');
    expect(v.reusable).toBe(true);
    expect(v.requestsServed).toBe(0);
  });

  it('counts in-flight requests up to pipeline depth', () => {
    tracker.beginRequest('c1');
    tracker.beginRequest('c1');
    const v = tracker.canReuse('c1');
    expect(v.inFlight).toBe(2);
    expect(v.reusable).toBe(false); // depth reached
    tracker.endRequest('c1');
    expect(tracker.canReuse('c1').reusable).toBe(true);
  });

  it('enforces maxRequests as a lifetime cap', () => {
    for (let i = 0; i < 3; i++) {
      tracker.beginRequest('c1');
      tracker.endRequest('c1');
    }
    const v = tracker.canReuse('c1');
    expect(v.reusable).toBe(false);
    expect(v.reason).toBe('max-requests');
  });

  it('flags idle-timeout staleness', () => {
    tracker.beginRequest('c1');
    tracker.endRequest('c1');
    clock.advance(10_001);
    const v = tracker.canReuse('c1');
    expect(v.reusable).toBe(false);
    expect(v.reason).toBe('idle-timeout');
    clock.set(5_000);
    expect(tracker.canReuse('c2').reusable).toBe(true);
  });

  it('closed conns beat every other verdict', () => {
    tracker.beginRequest('c1');
    tracker.close('c1');
    const v = tracker.canReuse('c1');
    expect(v.reusable).toBe(false);
    expect(v.reason).toBe('closed');
    expect(v.inFlight).toBe(0);
  });

  it('sweep evicts stale and closed records', () => {
    tracker.beginRequest('live');
    tracker.endRequest('live');
    tracker.beginRequest('dead');
    tracker.endRequest('dead');
    tracker.close('closed-conn');

    clock.advance(11_000);
    const dead = tracker.sweep();
    expect(dead.sort()).toEqual(['closed-conn', 'dead', 'live'].sort());
    expect(tracker.trackedConnections).toBe(0);
  });

  it('staleInMs reports time until staleness', () => {
    tracker.beginRequest('c1');
    tracker.endRequest('c1');
    clock.advance(4_000);
    expect(tracker.canReuse('c1').staleInMs).toBe(6_000);
  });
});
