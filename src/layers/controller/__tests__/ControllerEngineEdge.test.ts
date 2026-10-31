/**
 * Controller Engine — Edge Case Tests
 *
 * Boundary conditions for streaming, multipart, SSE, long-polling,
 * DI, and the post-handler pipeline: partial chunk reads, boundary
 * collisions, replay-overflow, multi-topic waits, nested scopes, and
 * pipeline error-mapping.
 */

import { describe, it, expect, beforeEach } from 'bun:test';

import {
  BoundedChunkStream,
  RequestStreamImpl,
  MultipartWriter,
  SseController,
  encodeSseFrame,
  LongPollHub,
  ManualPollScheduler,
  DiContainer,
  ControllerRunner,
  UnregisteredTokenError,
  ControllerPipeline,
  PipelineAbort,
  envelopeStage,
  problemMappingStage,
} from '../engine';
import { ControllerRequestContext } from '../engine/streaming-types';

const enc = new TextEncoder();
const dec = new TextDecoder();
const bytes = (s: string) => enc.encode(s);

function ctx(overrides?: Partial<ControllerRequestContext>): ControllerRequestContext {
  const container = new DiContainer();
  return {
    path: '/x',
    correlationId: 'c-1',
    state: {},
    resolve: <T,>(t: string | symbol) => container.resolve<T>(t),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Chunk stream edges
// ---------------------------------------------------------------------------

describe('BoundedChunkStream — edges', () => {
  it('write after close returns closed', () => {
    const s = new BoundedChunkStream({ capacity: 10 });
    s.close();
    expect(s.write(bytes('x')).kind).toBe('closed');
  });

  it('read(0) returns nothing', () => {
    const s = new BoundedChunkStream({ capacity: 10 });
    s.write(bytes('abc'));
    expect(s.read(0)).toEqual([]);
    expect(s.buffered).toBe(3);
  });

  it('onClose fires immediately when already closed', () => {
    const s = new BoundedChunkStream({ capacity: 10 });
    s.close();
    let fired = 0;
    s.onClose(() => {
      fired += 1;
    });
    expect(fired).toBe(1);
  });
});

describe('RequestStreamImpl — edges', () => {
  it('pull(maxChunks) limits batch size', () => {
    const s = new RequestStreamImpl({ capacity: 100 });
    s.push(bytes('a'));
    s.push(bytes('b'));
    s.push(bytes('c'));
    expect(s.pull(2).length).toBe(2);
    expect(s.pull().length).toBe(1);
  });

  it('cumulative bytes are tracked across pushes', () => {
    const s = new RequestStreamImpl({ capacity: 100 });
    s.push(bytes('aaa'));
    s.push(bytes('bb'));
    const chunks = s.pull();
    expect(chunks[1].cumulativeBytes).toBe(5);
    expect(s.stats().totalBytes).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Multipart edges
// ---------------------------------------------------------------------------

describe('MultipartWriter — edges', () => {
  it('empty writer emits only the closing boundary', () => {
    const w = new MultipartWriter({ boundary: 'B' });
    const res = w.serialize();
    expect(dec.decode(res.body)).toBe('--B--\r\n');
    expect(res.partCount).toBe(0);
  });

  it('binary bodies pass through untouched', () => {
    const w = new MultipartWriter({ boundary: 'B' });
    const bin = new Uint8Array([0, 159, 146, 150]);
    w.addPart({ contentType: 'application/octet-stream', body: bin });
    const res = w.serialize();
    const text = dec.decode(res.body);
    expect(text).toContain('--B--');
    // Bytes survive round-trip.
    const idx = res.body.indexOf(0);
    expect(res.body.slice(idx, idx + 4)).toEqual(bin);
  });

  it('auto-generated boundaries differ across writers', () => {
    const a = new MultipartWriter();
    const b = new MultipartWriter();
    expect(a.boundary).not.toBe(b.boundary);
  });
});

// ---------------------------------------------------------------------------
// SSE edges
// ---------------------------------------------------------------------------

describe('SseController — edges', () => {
  it('resume with unknown id replays nothing', () => {
    const sse = new SseController();
    sse.emit({ data: 'a' });
    sse.pull();
    expect(sse.resume('not-a-number')).toBe(0);
    expect(sse.resume(undefined)).toBe(0);
  });

  it('frames with unicode data round-trip through the encoder', () => {
    const frame = encodeSseFrame([{ data: 'héllo wörld' }]);
    const text = dec.decode(frame.bytes);
    expect(text).toContain('data: héllo wörld');
  });

  it('buffer evicts oldest beyond replayCapacity', () => {
    const sse = new SseController({ replayCapacity: 2 });
    sse.emit({ data: 'a' });
    sse.emit({ data: 'b' });
    sse.emit({ data: 'c' });
    sse.pull();
    // Only b+c are replayable.
    expect(sse.resume('0')).toBe(2);
    const text = dec.decode(sse.pull().bytes);
    expect(text).not.toContain('data: a');
  });
});

// ---------------------------------------------------------------------------
// Long-poll edges
// ---------------------------------------------------------------------------

describe('LongPollHub — edges', () => {
  it('wait resolves before publish deadline → no timer leak', async () => {
    const sched = new ManualPollScheduler();
    const hub = new LongPollHub({ scheduler: sched });
    hub.wait<string>('t', { timeoutMs: 1000 });
    hub.publish('t', 'v');
    // Timer was cleared — nothing left scheduled.
    expect(sched.pendingTimers).toBe(0);
  });

  it('cancel settles as timeout', async () => {
    const hub = new LongPollHub();
    const d = hub.wait<string>('t', { timeoutMs: 10_000 });
    d.cancel();
    const o = await d.promise;
    expect(o.kind).toBe('timeout');
  });

  it('double resolve is a no-op', async () => {
    const hub = new LongPollHub();
    const d = hub.wait<string>('t', { timeoutMs: 10_000 });
    d.resolve('first');
    d.resolve('second');
    const o = await d.promise;
    expect(o.kind).toBe('resolved');
    if (o.kind === 'resolved') {
      expect(o.value).toBe('first');
    }
  });
});

// ---------------------------------------------------------------------------
// DI edges
// ---------------------------------------------------------------------------

describe('DiContainer — edges', () => {
  it('has() walks the parent chain', () => {
    const parent = new DiContainer();
    parent.registerInstance('p', 1);
    const child = parent.createScope();
    expect(child.has('p')).toBe(true);
    expect(child.has('missing')).toBe(false);
  });

  it('symbol tokens work', () => {
    const c = new DiContainer();
    const tok = Symbol('svc');
    c.registerInstance(tok, 'v');
    expect(c.resolve(tok)).toBe('v');
  });

  it('unregistered symbol token throws', () => {
    const c = new DiContainer();
    expect(() => c.resolve(Symbol('nope'))).toThrow(UnregisteredTokenError);
  });
});

describe('ControllerRunner — edges', () => {
  it('run on unregistered controller throws', async () => {
    const runner = new ControllerRunner();
    await expect(runner.run('nope', '/x')).rejects.toThrow();
  });

  it('run after dispose throws', async () => {
    const runner = new ControllerRunner();
    runner.register('c', { handle: async () => 1 });
    await runner.dispose();
    await expect(runner.run('c', '/x')).rejects.toThrow();
  });

  it('custom correlation id factory is used', async () => {
    const runner = new ControllerRunner({ correlationId: () => 'fixed-id' });
    runner.register('c', { handle: async (c) => c.correlationId });
    const res = await runner.run('c', '/x');
    expect(res.correlationId).toBe('fixed-id');
  });
});

// ---------------------------------------------------------------------------
// Controller pipeline
// ---------------------------------------------------------------------------

describe('ControllerPipeline', () => {
  it('stages run in order and can transform the value', async () => {
    const p = new ControllerPipeline();
    p.stage('double', (f) => {
      f.value = (f.value as number) * 2;
    });
    p.stage('add1', (f) => {
      f.value = (f.value as number) + 1;
    });
    const res = await p.run(5, ctx());
    expect(res.value).toBe(11);
    expect(res.stageTrace).toEqual(['double', 'add1']);
  });

  it('stage can set status + headers via meta', async () => {
    const p = new ControllerPipeline();
    p.stage('enrich', (f) => {
      f.meta.status = 201;
      f.meta.headers['x-tag'] = 'created';
    });
    const res = await p.run('v', ctx());
    expect(res.status).toBe(201);
    expect(res.headers['x-tag']).toBe('created');
  });

  it('PipelineAbort short-circuits with status + body', async () => {
    const p = new ControllerPipeline();
    p.stage('a', () => {
      throw new PipelineAbort(422, { error: 'invalid' });
    });
    p.stage('b', () => {
      throw new Error('unreachable');
    });
    const res = await p.run('v', ctx());
    expect(res.status).toBe(422);
    expect(res.value).toEqual({ error: 'invalid' });
    expect(res.aborted).toBe(true);
    expect(res.stageTrace).toEqual([]);
  });

  it('frame.aborted skips remaining stages', async () => {
    const p = new ControllerPipeline();
    p.stage('a', (f) => {
      f.aborted = true;
    });
    p.stage('b', () => {
      throw new Error('unreachable');
    });
    const res = await p.run('v', ctx());
    expect(res.aborted).toBe(true);
    expect(res.stageTrace).toEqual(['a']);
  });

  it('error stages map errors to structured responses', async () => {
    const p = new ControllerPipeline();
    p.stage('boom', () => {
      throw new Error('not_found_thing');
    });
    p.onError(
      problemMappingStage((e) => (e instanceof Error && e.message.includes('not_found') ? 404 : null))
    );
    const res = await p.run('v', ctx());
    expect(res.status).toBe(404);
    expect((res.value as { detail: string }).detail).toContain('not_found_thing');
  });

  it('unhandled errors rethrow', async () => {
    const p = new ControllerPipeline();
    p.stage('boom', () => {
      throw new Error('unhandled');
    });
    await expect(p.run('v', ctx())).rejects.toThrow('unhandled');
  });

  it('envelope stage wraps the value', async () => {
    const p = new ControllerPipeline({ stages: [envelopeStage()] });
    const res = await p.run({ id: 1 }, ctx());
    expect((res.value as { data: unknown }).data).toEqual({ id: 1 });
  });
});
