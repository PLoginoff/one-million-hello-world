/**
 * Controller Streaming Engine Tests
 *
 * Covers: bounded chunk stream backpressure, request body streaming,
 * multipart/mixed serialization + boundary collision detection,
 * SSE wire format + replay/resume, long-poll deferred resolution +
 * timeout, and the DI container + lifecycle hooks.
 */

import { describe, it, expect, beforeEach } from 'bun:test';

import {
  BoundedChunkStream,
  RequestStreamImpl,
  createRequestStream,
  feedBody,
  MultipartWriter,
  BoundaryCollisionError,
  SseController,
  SseReplayBuffer,
  encodeSseEvent,
  encodeSseFrame,
  SSE_CONTENT_TYPE,
  LongPollHub,
  ManualPollScheduler,
  DiContainer,
  ControllerRunner,
  UnregisteredTokenError,
} from '../engine';

const enc = new TextEncoder();
const dec = new TextDecoder();

function bytes(s: string): Uint8Array {
  return enc.encode(s);
}

// ---------------------------------------------------------------------------
// Bounded chunk stream
// ---------------------------------------------------------------------------

describe('BoundedChunkStream', () => {
  it('accepts writes under capacity', () => {
    const s = new BoundedChunkStream({ capacity: 100 });
    expect(s.write(bytes('hello')).kind).toBe('accepted');
    expect(s.buffered).toBe(5);
  });

  it('returns full when exceeding capacity — nothing dropped', () => {
    const s = new BoundedChunkStream({ capacity: 10 });
    expect(s.write(bytes('12345678')).kind).toBe('accepted');
    const res = s.write(bytes('more'));
    expect(res.kind).toBe('full');
    expect(s.buffered).toBe(8);
    // Data is still readable — the write was refused, not truncated.
    const drained = s.drain();
    expect(dec.decode(drained[0])).toBe('12345678');
  });

  it('read() splits oversized chunks at the byte budget', () => {
    const s = new BoundedChunkStream({ capacity: 100 });
    s.write(bytes('abcdef'));
    const part = s.read(4);
    expect(part.map((c) => dec.decode(c)).join('')).toBe('abcd');
    expect(s.buffered).toBe(2);
    expect(dec.decode(s.drain()[0])).toBe('ef');
  });

  it('fires onClose listeners', () => {
    const s = new BoundedChunkStream({ capacity: 10 });
    let fired = 0;
    s.onClose(() => {
      fired += 1;
    });
    s.close();
    s.close(); // idempotent
    expect(fired).toBe(1);
    expect(s.closed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Request stream
// ---------------------------------------------------------------------------

describe('RequestStreamImpl', () => {
  it('tags chunks with index + cumulative bytes', () => {
    const s = new RequestStreamImpl({ capacity: 100 });
    s.push(bytes('aa'));
    s.push(bytes('bbb'));
    const chunks = s.pull();
    expect(chunks.length).toBe(2);
    expect(chunks[0].index).toBe(0);
    expect(chunks[0].cumulativeBytes).toBe(2);
    expect(chunks[1].index).toBe(1);
    expect(chunks[1].cumulativeBytes).toBe(5);
  });

  it('counts backpressure events when the buffer fills', () => {
    const s = new RequestStreamImpl({ capacity: 4 });
    s.push(bytes('1234'));
    const res = s.push(bytes('x'));
    expect(res.kind).toBe('full');
    expect(s.stats().backpressureEvents).toBe(1);
    s.pull();
    expect(s.push(bytes('x')).kind).toBe('accepted');
  });

  it('rejects pushes after finish', () => {
    const s = createRequestStream({ capacity: 10 });
    s.finish();
    expect(s.push(bytes('x')).kind).toBe('closed');
  });
});

describe('feedBody', () => {
  it('paces a large body through a small buffer', () => {
    const s = createRequestStream({ capacity: 8 });
    const body = bytes('0123456789ABCDEFGHIJ'); // 20 bytes
    const { accepted, stalled } = feedBody(s, body, 6);
    // 20 bytes in 6-byte slices = 4 pushes; capacity 8 → some stall.
    expect(accepted).toBe(4);
    expect(stalled).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Multipart writer
// ---------------------------------------------------------------------------

describe('MultipartWriter', () => {
  it('serializes parts with headers and boundary delimiters', () => {
    const w = new MultipartWriter({ boundary: 'X' });
    w.addPart({ contentType: 'text/plain', body: 'hello' });
    w.addPart({ contentType: 'application/json', body: '{"a":1}' });
    const res = w.serialize();
    const text = dec.decode(res.body);
    expect(res.contentType).toBe('multipart/mixed; boundary=X');
    expect(res.partCount).toBe(2);
    expect(text).toContain('--X\r\nContent-Type: text/plain\r\n\r\nhello\r\n');
    expect(text).toContain('--X--');
  });

  it('emits Content-Disposition and custom headers', () => {
    const w = new MultipartWriter({ boundary: 'B' });
    w.addPart({
      contentType: 'application/octet-stream',
      body: bytes([1, 2, 3]),
      contentDisposition: 'attachment; filename="f.bin"',
      headers: { 'X-Checksum': 'abc' },
    });
    const text = dec.decode(w.serialize().body);
    expect(text).toContain('Content-Disposition: attachment; filename="f.bin"');
    expect(text).toContain('X-Checksum: abc');
  });

  it('throws on boundary collision in body', () => {
    const w = new MultipartWriter({ boundary: 'MARK' });
    w.addPart({ contentType: 'text/plain', body: 'this contains --MARK inside' });
    expect(() => w.serialize()).toThrow(BoundaryCollisionError);
  });
});

// ---------------------------------------------------------------------------
// SSE
// ---------------------------------------------------------------------------

describe('encodeSseEvent', () => {
  it('emits id/event/retry/data fields', () => {
    const text = encodeSseEvent({ event: 'tick', id: '7', retry: 1000, data: 'x' });
    expect(text).toBe('event: tick\nid: 7\nretry: 1000\ndata: x\n\n');
  });

  it('splits multi-line data into repeated data: fields', () => {
    const text = encodeSseEvent({ data: 'a\nb' });
    expect(text).toBe('data: a\ndata: b\n\n');
  });

  it('emits comment-only frames', () => {
    const text = encodeSseEvent({ comment: 'hb', data: '' });
    expect(text).toContain(': hb');
  });
});

describe('SseController', () => {
  let sse: SseController;

  beforeEach(() => {
    sse = new SseController({ retryMs: 1500 });
  });

  it('auto-assigns sequential ids and sends retry once', () => {
    sse.emit({ data: 'one' });
    sse.emit({ data: 'two' });
    const frame = sse.pull();
    const text = dec.decode(frame.bytes);
    expect(text).toContain('id: 0');
    expect(text).toContain('id: 1');
    expect(text).toContain('retry: 1500');
    // Retry sent only with the first event.
    expect(text.match(/retry:/g)?.length).toBe(1);
  });

  it('resume() replays events newer than Last-Event-ID', () => {
    sse.emit({ data: 'a' });
    sse.emit({ data: 'b' });
    sse.emit({ data: 'c' });
    sse.pull(); // drain

    const replayed = sse.resume('0');
    expect(replayed).toBe(2);
    const text = dec.decode(sse.pull().bytes);
    expect(text).toContain('data: b');
    expect(text).toContain('data: c');
    expect(text).not.toContain('data: a');
  });

  it('rejects emit after close', () => {
    sse.close();
    expect(() => sse.emit({ data: 'x' })).toThrow();
    expect(SSE_CONTENT_TYPE).toBe('text/event-stream');
  });
});

describe('SseReplayBuffer', () => {
  it('evicts oldest at capacity', () => {
    const buf = new SseReplayBuffer(3);
    for (let i = 0; i < 5; i++) {
      buf.push({ data: `e${i}`, id: String(i), seq: i });
    }
    expect(buf.size).toBe(3);
    const since = buf.since('2');
    expect(since.length).toBe(2);
    expect(since[0].data).toBe('e3');
  });
});

// ---------------------------------------------------------------------------
// Long-poll
// ---------------------------------------------------------------------------

describe('LongPollHub', () => {
  let hub: LongPollHub;
  let scheduler: ManualPollScheduler;
  let nowMs: number;

  beforeEach(() => {
    nowMs = 0;
    scheduler = new ManualPollScheduler();
    hub = new LongPollHub({ scheduler, now: () => nowMs });
  });

  it('publish resolves all parked waiters with the value', async () => {
    const d1 = hub.wait<string>('topic', { timeoutMs: 1000 });
    const d2 = hub.wait<string>('topic', { timeoutMs: 1000 });
    expect(hub.parkedCount).toBe(2);

    const woken = hub.publish('topic', 'payload');
    expect(woken).toBe(2);

    const o1 = await d1.promise;
    const o2 = await d2.promise;
    expect(o1.kind).toBe('resolved');
    expect(o2.kind).toBe('resolved');
    if (o1.kind === 'resolved') {
      expect(o1.value).toBe('payload');
    }
    expect(hub.parkedCount).toBe(0);
  });

  it('timeout resolves with kind=timeout after the deadline', async () => {
    const d = hub.wait<string>('t', { timeoutMs: 500 });
    scheduler.tick(500);
    const outcome = await d.promise;
    expect(outcome.kind).toBe('timeout');
    expect(hub.stats().timedOut).toBe(1);
  });

  it('publish on an empty topic is a no-op', () => {
    expect(hub.publish('nope', 'v')).toBe(0);
  });

  it('waiters on different topics are independent', async () => {
    const d1 = hub.wait<string>('a', { timeoutMs: 1000 });
    hub.wait<string>('b', { timeoutMs: 1000 });
    hub.publish('a', 'for-a');
    const o1 = await d1.promise;
    expect(o1.kind).toBe('resolved');
    expect(hub.topics()).toEqual(['b']);
  });
});

// ---------------------------------------------------------------------------
// DI container + lifecycle
// ---------------------------------------------------------------------------

describe('DiContainer', () => {
  it('resolves singletons (cached) and transients (per-resolve)', () => {
    const c = new DiContainer();
    let made = 0;
    c.register('singleton', () => ({ id: ++made }));
    const a = c.resolve<{ id: number }>('singleton');
    const b = c.resolve<{ id: number }>('singleton');
    expect(a).toBe(b);

    let tMade = 0;
    c.register('transient', () => ({ id: ++tMade }), { singleton: false });
    const t1 = c.resolve<{ id: number }>('transient');
    const t2 = c.resolve<{ id: number }>('transient');
    expect(t1.id).toBe(1);
    expect(t2.id).toBe(2);
  });

  it('registerInstance always returns the same object', () => {
    const c = new DiContainer();
    const inst = { tag: 'x' };
    c.registerInstance('svc', inst);
    expect(c.resolve('svc')).toBe(inst);
  });

  it('scoped children shadow the parent without mutating it', () => {
    const parent = new DiContainer();
    parent.registerInstance('name', 'parent');
    const scope = parent.createScope();
    scope.registerInstance('name', 'child');
    expect(scope.resolve('name')).toBe('child');
    expect(parent.resolve('name')).toBe('parent');
  });

  it('resolves dependencies through the container', () => {
    const c = new DiContainer();
    c.registerInstance('config', { url: 'db://x' });
    c.register('db', (cont) => ({ conn: cont.resolve<{ url: string }>('config').url }));
    expect(c.resolve<{ conn: string }>('db').conn).toBe('db://x');
  });

  it('throws UnregisteredTokenError on miss', () => {
    const c = new DiContainer();
    expect(() => c.resolve('missing')).toThrow(UnregisteredTokenError);
  });
});

describe('ControllerRunner', () => {
  it('runs init before first dispatch, dispose on shutdown', async () => {
    const calls: string[] = [];
    const runner = new ControllerRunner();
    runner.register('c', {
      lifecycle: {
        init: () => {
          calls.push('init');
        },
        dispose: () => {
          calls.push('dispose');
        },
      },
      handle: async () => 'ok',
    });
    const res = await runner.run('c', '/x');
    expect(res.value).toBe('ok');
    expect(calls).toEqual(['init']);
    await runner.dispose();
    expect(calls).toEqual(['init', 'dispose']);
  });

  it('runs before/after hooks around handle', async () => {
    const order: string[] = [];
    const runner = new ControllerRunner();
    runner.register('c', {
      lifecycle: {
        beforeRequest: () => {
          order.push('before');
        },
        afterRequest: () => {
          order.push('after');
        },
      },
      handle: async () => {
        order.push('handle');
        return 1;
      },
    });
    await runner.run('c', '/x');
    expect(order).toEqual(['before', 'handle', 'after']);
  });

  it('afterRequest runs even when handle throws', async () => {
    let after = 0;
    const runner = new ControllerRunner();
    runner.register('c', {
      lifecycle: {
        afterRequest: () => {
          after += 1;
        },
      },
      handle: async () => {
        throw new Error('boom');
      },
    });
    await expect(runner.run('c', '/x')).rejects.toThrow('boom');
    expect(after).toBe(1);
  });

  it('injects dependencies through ctx.resolve', async () => {
    const container = new DiContainer();
    container.registerInstance('answer', 42);
    const runner = new ControllerRunner({ container });
    runner.register('c', {
      handle: async (ctx) => ctx.resolve<number>('answer') * 2,
    });
    const res = await runner.run('c', '/x');
    expect(res.value).toBe(84);
  });

  it('dispose runs hooks in reverse registration order', async () => {
    const order: string[] = [];
    const runner = new ControllerRunner();
    for (const name of ['a', 'b', 'c']) {
      runner.register(name, {
        lifecycle: {
          dispose: () => {
            order.push(name);
          },
        },
        handle: async () => name,
      });
    }
    await runner.dispose();
    expect(order).toEqual(['c', 'b', 'a']);
  });
});
