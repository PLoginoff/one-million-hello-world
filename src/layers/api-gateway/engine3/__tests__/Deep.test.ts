/**
 * Deep coverage for WsProxyEngine relay internals, GrpcMethodRouter
 * deadline semantics, IdempotencyStore concurrency, HealthAwareBalancer
 * edge cases and RpcPipeline composition.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  encodeFrame,
  decodeFrames,
  closePayload,
  InMemoryWsEndpoint,
  WsRelay,
  WsProxyEngine,
} from '../WsProxyEngine';
import { GrpcMethodRouter, GrpcError } from '../GrpcMethodRouter';
import { IdempotencyStore, requestFingerprint } from '../IdempotencyStore';
import { HealthAwareBalancer } from '../HealthAwareBalancer';
import {
  RpcPipeline,
  headerInjectionStage,
  deadlinePropagationStage,
  idempotencyStage,
  RpcRequest,
  RpcResult,
} from '../RpcPipeline';
import {
  ManualGatewayClock3,
  WS_OP_TEXT,
  WS_OP_BINARY,
  WS_OP_CLOSE,
  WS_OP_PING,
  WS_OP_PONG,
} from '../types3';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

describe('WsProxyEngine — frame codec internals', () => {
  it('mask key applies cyclically over the payload', () => {
    const payload = encoder.encode('abcd');
    const wire = encodeFrame(
      { fin: true, opcode: WS_OP_TEXT, payload },
      true,
      new Uint8Array([1, 2, 3, 4])
    );
    // header 2 bytes + mask 4 + payload 4
    expect(wire.length).toBe(10);
    // masked bytes: 'a'^1, 'b'^2, 'c'^3, 'd'^4
    const out = decodeFrames(wire, true);
    expect(decoder.decode(out.frames[0]!.payload)).toBe('abcd');
  });

  it('opcode is masked to 4 bits; fin bit is separate', () => {
    const wire = encodeFrame({ fin: false, opcode: WS_OP_BINARY, payload: encoder.encode('x') }, false);
    expect(wire[0]! & 0x80).toBe(0);
    expect(wire[0]! & 0x0f).toBe(WS_OP_BINARY);
  });

  it('empty payload encodes as length 0', () => {
    const wire = encodeFrame({ fin: true, opcode: WS_OP_TEXT, payload: new Uint8Array(0) }, false);
    expect(wire.length).toBe(2);
    const out = decodeFrames(wire, false);
    expect(out.frames[0]!.payload.length).toBe(0);
  });

  it('RSV bits set throws a protocol error', () => {
    const wire = encodeFrame({ fin: true, opcode: WS_OP_TEXT, payload: encoder.encode('x') }, false);
    wire[0] = wire[0]! | 0x40; // set RSV1
    expect(() => decodeFrames(wire, false)).toThrow(/RSV/);
  });

  it('fragmented control frame throws', () => {
    const wire = encodeFrame({ fin: false, opcode: WS_OP_CLOSE, payload: closePayload(1000, '') }, false);
    expect(() => decodeFrames(wire, false)).toThrow(/fragmented/);
  });

  it('control frame over 125 bytes throws', () => {
    // A 126-length close frame — illegal per RFC 6455 §5.5.
    const payload = new Uint8Array(126).fill(0);
    const wire = encodeFrame({ fin: true, opcode: WS_OP_CLOSE, payload }, false);
    expect(() => decodeFrames(wire, false)).toThrow(/125/);
  });

  it('126 boundary: exactly 125 uses short length, 126 uses extended', () => {
    const p125 = new Uint8Array(125);
    const p126 = new Uint8Array(126);
    const w125 = encodeFrame({ fin: true, opcode: WS_OP_BINARY, payload: p125 }, false);
    const w126 = encodeFrame({ fin: true, opcode: WS_OP_BINARY, payload: p126 }, false);
    expect(w125[1]).toBe(125);
    expect(w126[1]).toBe(126);
    expect(decodeFrames(w125, false).frames[0]!.payload.length).toBe(125);
    expect(decodeFrames(w126, false).frames[0]!.payload.length).toBe(126);
  });
});

describe('WsRelay — incremental feed', () => {
  let client: InMemoryWsEndpoint;
  let upstream: InMemoryWsEndpoint;
  let relay: WsRelay;

  beforeEach(() => {
    client = new InMemoryWsEndpoint();
    upstream = new InMemoryWsEndpoint();
    relay = new WsRelay(client, upstream);
  });

  it('byte-by-byte feed reassembles one frame', () => {
    const wire = encodeFrame({ fin: true, opcode: WS_OP_TEXT, payload: encoder.encode('slow') }, true);
    for (const byte of wire) relay.feedClient(new Uint8Array([byte]));
    const decoded = decodeFrames(upstream.bytes(), true);
    expect(decoded.frames.length).toBe(1);
    expect(decoder.decode(decoded.frames[0]!.payload)).toBe('slow');
  });

  it('two frames split mid-way still decode in order', () => {
    const a = encodeFrame({ fin: true, opcode: WS_OP_TEXT, payload: encoder.encode('one') }, true);
    const b = encodeFrame({ fin: true, opcode: WS_OP_TEXT, payload: encoder.encode('two') }, true);
    const both = new Uint8Array(a.length + b.length);
    both.set(a, 0);
    both.set(b, a.length);
    relay.feedClient(both.slice(0, a.length + 1)); // all of a + 1 byte of b
    relay.feedClient(both.slice(a.length + 1));
    const decoded = decodeFrames(upstream.bytes(), true);
    expect(decoded.frames.map((f) => decoder.decode(f.payload))).toEqual(['one', 'two']);
  });

  it('bytes accumulate in stats across feeds', () => {
    const wire = encodeFrame({ fin: true, opcode: WS_OP_TEXT, payload: encoder.encode('x') }, true);
    relay.feedClient(wire);
    relay.feedClient(wire);
    expect(relay.snapshot().bytesClientToUpstream).toBe(wire.length * 2);
    expect(relay.snapshot().framesClientToUpstream).toBe(2);
  });

  it('pong is consumed locally and counted', () => {
    const pong = encodeFrame({ fin: true, opcode: WS_OP_PONG, payload: encoder.encode('p') }, true);
    relay.feedClient(pong);
    expect(upstream.sent.length).toBe(0);
    expect(relay.snapshot().pongs).toBe(1);
  });

  it('upstream ping answers to the upstream endpoint masked=false', () => {
    const ping = encodeFrame({ fin: true, opcode: WS_OP_PING, payload: encoder.encode('q') }, false);
    relay.feedUpstream(ping);
    expect(client.sent.length).toBe(0);
    const decoded = decodeFrames(upstream.bytes(), false);
    expect(decoded.frames[0]!.opcode).toBe(WS_OP_PONG);
  });

  it('hook may transform frame payloads', () => {
    const r = new WsRelay(client, upstream, {
      onFrame: (f) => ({ ...f, payload: encoder.encode(decoder.decode(f.payload).toUpperCase()) }),
    });
    r.feedClient(encodeFrame({ fin: true, opcode: WS_OP_TEXT, payload: encoder.encode('up') }, true));
    const decoded = decodeFrames(upstream.bytes(), true);
    expect(decoder.decode(decoded.frames[0]!.payload)).toBe('UP');
  });

  it('independent fragment state per direction', () => {
    // Interleave a client fragment and an upstream fragment.
    const cf1 = encodeFrame({ fin: false, opcode: WS_OP_TEXT, payload: encoder.encode('C1') }, true);
    const uf1 = encodeFrame({ fin: false, opcode: WS_OP_TEXT, payload: encoder.encode('U1') }, false);
    const cf2 = encodeFrame({ fin: true, opcode: 0x0, payload: encoder.encode('C2') }, true);
    const uf2 = encodeFrame({ fin: true, opcode: 0x0, payload: encoder.encode('U2') }, false);
    relay.feedClient(cf1);
    relay.feedUpstream(uf1);
    relay.feedClient(cf2);
    relay.feedUpstream(uf2);
    const upDecoded = decodeFrames(upstream.bytes(), true);
    const clDecoded = decodeFrames(client.bytes(), false);
    expect(decoder.decode(upDecoded.frames[0]!.payload)).toBe('C1C2');
    expect(decoder.decode(clDecoded.frames[0]!.payload)).toBe('U1U2');
  });

  it('orphan continuation triggers protocol failure close', () => {
    const cont = encodeFrame({ fin: true, opcode: 0x0, payload: encoder.encode('x') }, true);
    relay.feedClient(cont);
    expect(relay.snapshot().closed).toBe(true);
  });

  it('WsProxyEngine façade wires a relay', () => {
    const engine = new WsProxyEngine();
    const r = engine.relay(client, upstream);
    r.feedClient(encodeFrame({ fin: true, opcode: WS_OP_TEXT, payload: encoder.encode('v') }, true));
    expect(upstream.sent.length).toBe(1);
  });
});

describe('GrpcMethodRouter — deadline edge cases', () => {
  let clock: ManualGatewayClock3;
  let router: GrpcMethodRouter;

  beforeEach(() => {
    clock = new ManualGatewayClock3(5_000);
    router = new GrpcMethodRouter({ clock });
  });

  it('deadlineRemainingMs is undefined when no deadline configured', async () => {
    let seen: number | undefined | 'unset' = 'unset';
    router.register({
      path: '/a.B/C',
      handler: (_c, ctx) => {
        seen = ctx.deadlineRemainingMs;
        return { status: 'OK' };
      },
    });
    await router.invoke({ path: '/a.B/C', message: null });
    expect(seen).toBeUndefined();
  });

  it('response preserves non-OK statuses even past deadline', async () => {
    router.register({
      path: '/a.B/D',
      handler: () => {
        clock.advance(999);
        return { status: 'NOT_FOUND' };
      },
      defaultTimeoutMs: 10,
    });
    const res = await router.invoke({ path: '/a.B/D', message: null });
    // The late-OK override only applies to OK; NOT_FOUND survives.
    expect(res.status).toBe('NOT_FOUND');
  });

  it('router-level fallback timeout applies', async () => {
    const r2 = new GrpcMethodRouter({ clock, defaultTimeoutMs: 100 });
    let seen: number | undefined;
    r2.register({
      path: '/a.B/E',
      handler: (_c, ctx) => {
        seen = ctx.deadlineRemainingMs;
        return { status: 'OK' };
      },
    });
    await r2.invoke({ path: '/a.B/E', message: null });
    expect(seen).toBe(100);
  });

  it('method default beats router fallback', async () => {
    const r2 = new GrpcMethodRouter({ clock, defaultTimeoutMs: 100 });
    let seen: number | undefined;
    r2.register({
      path: '/a.B/F',
      handler: (_c, ctx) => {
        seen = ctx.deadlineRemainingMs;
        return { status: 'OK' };
      },
      defaultTimeoutMs: 42,
    });
    await r2.invoke({ path: '/a.B/F', message: null });
    expect(seen).toBe(42);
  });

  it('metadata passes through to the handler call', async () => {
    let meta: Readonly<Record<string, string>> | undefined;
    router.register({
      path: '/a.B/G',
      handler: (c) => {
        meta = c.metadata;
        return { status: 'OK' };
      },
    });
    await router.invoke({
      path: '/a.B/G',
      message: null,
      metadata: { authorization: 'Bearer x' },
    });
    expect(meta).toEqual({ authorization: 'Bearer x' });
  });

  it('async handlers are awaited', async () => {
    router.register({
      path: '/a.B/H',
      handler: async () => {
        await Promise.resolve();
        return { status: 'OK', message: { done: true } };
      },
    });
    const res = await router.invoke({ path: '/a.B/H', message: null });
    expect(res.message).toEqual({ done: true });
  });
});

describe('IdempotencyStore — concurrency edges', () => {
  let clock: ManualGatewayClock3;
  let store: IdempotencyStore;

  beforeEach(() => {
    clock = new ManualGatewayClock3(0);
    store = new IdempotencyStore({ clock, ttlMs: 10_000 });
  });

  it('multiple waiters on one key all resolve', async () => {
    const fp = requestFingerprint('POST', '/x', 'b');
    store.check('k', fp);
    const w1 = store.wait('k');
    const w2 = store.wait('k');
    store.store('k', { status: 200, body: 'r' });
    expect((await w1)?.status).toBe(200);
    expect((await w2)?.status).toBe(200);
  });

  it('wait on unknown key resolves undefined', async () => {
    expect(await store.wait('nope')).toBeUndefined();
  });

  it('store on an unchecked key creates a stored entry', () => {
    store.store('fresh', { status: 201, body: 'x' });
    const r = store.check('fresh', requestFingerprint('P', '/p', ''));
    // fingerprint '' on stored entry conflicts with real fp
    expect(r.kind).toBe('conflict');
    expect(store.peek('fresh')?.status).toBe(201);
  });

  it('peek does not count as a hit', () => {
    const fp = requestFingerprint('POST', '/x', 'b');
    store.check('k', fp);
    store.store('k', { status: 200, body: 'x' });
    store.peek('k');
    store.peek('k');
    expect(store.stats().hits).toBe(0);
    store.check('k', fp);
    expect(store.stats().hits).toBe(1);
  });

  it('release on unknown key is a no-op', () => {
    expect(() => store.release('ghost')).not.toThrow();
  });

  it('clear() empties everything including in-flight', () => {
    store.check('a', requestFingerprint('P', '/', ''));
    store.check('b', requestFingerprint('P', '/', ''));
    store.clear();
    expect(store.stats().entries).toBe(0);
    expect(store.stats().inFlight).toBe(0);
  });

  it('stats track all counters independently', () => {
    const fp = requestFingerprint('POST', '/x', 'b');
    store.check('k1', fp); // miss
    store.check('k1', fp); // in-flight (not a miss)
    store.check('k2', fp); // miss
    store.store('k1', { status: 200, body: 'x' });
    store.check('k1', fp); // hit
    store.check('k3', requestFingerprint('PUT', '/y', 'b')); // miss
    const s = store.stats();
    expect(s.misses).toBe(3);
    expect(s.hits).toBe(1);
    expect(s.inFlight).toBe(2); // k2 + k3
  });
});

describe('HealthAwareBalancer — selection edges', () => {
  let clock: ManualGatewayClock3;

  beforeEach(() => {
    clock = new ManualGatewayClock3(0);
  });

  it('empty balancer picks undefined', () => {
    const b = new HealthAwareBalancer({ clock });
    expect(b.pick()).toBeUndefined();
  });

  it('static weight shifts the distribution', () => {
    const picks = new Map<string, number>();
    const b = new HealthAwareBalancer({ clock });
    b.add('heavy', 10);
    b.add('light', 1);
    for (let i = 0; i < 400; i++) {
      const p = b.pick()!;
      picks.set(p, (picks.get(p) ?? 0) + 1);
    }
    const heavyPicks = picks.get('heavy') ?? 0;
    expect(heavyPicks).toBeGreaterThan(300); // ~91% expected
  });

  it('acquire/report pair decrements inflight', () => {
    const b = new HealthAwareBalancer({ clock });
    b.add('u');
    b.acquire('u');
    b.acquire('u');
    expect(b.health('u')!.inflight).toBe(2);
    b.report('u', true, 10);
    expect(b.health('u')!.inflight).toBe(1);
    b.report('u', true, 10);
    expect(b.health('u')!.inflight).toBe(0);
    b.report('u', true, 10); // never goes negative
    expect(b.health('u')!.inflight).toBe(0);
  });

  it('first sample seeds EWMA directly (no zero bias)', () => {
    const b = new HealthAwareBalancer({ clock, alpha: 0.2 });
    b.add('u');
    b.report('u', true, 500);
    expect(b.health('u')!.ewmaLatencyMs).toBe(500);
  });

  it('half-open upstream failing again reopens the circuit', () => {
    const b = new HealthAwareBalancer({ clock, failureThreshold: 2, circuitResetMs: 100 });
    b.add('u');
    b.report('u', false, 10);
    b.report('u', false, 10);
    clock.advance(101);
    b.pick(); // → half-open
    expect(b.health('u')!.circuit).toBe('half-open');
    b.report('u', false, 10);
    expect(b.health('u')!.consecutiveFailures).toBe(3);
    expect(b.health('u')!.circuit).toBe('open');
  });

  it('healthAll returns sorted snapshots', () => {
    const b = new HealthAwareBalancer({ clock });
    b.add('z');
    b.add('a');
    b.add('m');
    expect(b.healthAll().map((h) => h.id)).toEqual(['a', 'm', 'z']);
  });

  it('report on unknown upstream is a no-op', () => {
    const b = new HealthAwareBalancer({ clock });
    expect(() => b.report('ghost', true, 1)).not.toThrow();
    expect(b.health('ghost')).toBeUndefined();
  });
});

describe('RpcPipeline', () => {
  let clock: ManualGatewayClock3;
  const req = (over: Partial<RpcRequest> = {}): RpcRequest => ({
    path: '/api/x',
    method: 'GET',
    headers: {},
    attributes: {},
    ...over,
  });
  const ok: RpcResult = { status: 200, headers: {}, body: 'ok' };

  beforeEach(() => {
    clock = new ManualGatewayClock3(0);
  });

  it('runs stages outer→inner→terminal and back', async () => {
    const order: string[] = [];
    const p = new RpcPipeline({ clock });
    p.use(async (_r, _c, next) => {
      order.push('a-in');
      const res = await next();
      order.push('a-out');
      return res;
    });
    p.use(async (_r, _c, next) => {
      order.push('b-in');
      const res = await next();
      order.push('b-out');
      return res;
    });
    await p.execute(req(), async () => {
      order.push('terminal');
      return ok;
    });
    expect(order).toEqual(['a-in', 'b-in', 'terminal', 'b-out', 'a-out']);
  });

  it('short-circuit skips inner stages and terminal', async () => {
    const order: string[] = [];
    const p = new RpcPipeline({ clock });
    p.use((_r, _c, _next) => {
      order.push('auth');
      return { status: 401, headers: {}, body: 'denied' };
    });
    p.use(async (_r, _c, next) => {
      order.push('inner');
      return next();
    });
    const res = await p.execute(req(), async () => {
      order.push('terminal');
      return ok;
    });
    expect(res.status).toBe(401);
    expect(order).toEqual(['auth']);
  });

  it('ctx.abort short-circuits with a marker', async () => {
    const p = new RpcPipeline({ clock });
    p.use((_r, ctx) => {
      ctx.abort({ status: 429, headers: {}, body: 'slow down' });
    });
    const res = await p.execute(req());
    expect(res.status).toBe(429);
    expect(res.shortcut).toBe('stage-short-circuit');
  });

  it('deadline gate stops a pipeline that arrives expired', async () => {
    const p = new RpcPipeline({ clock });
    p.use((_r, _c, next) => next());
    const res = await p.execute(req({ deadlineMs: -1 }));
    expect(res.status).toBe(504);
    expect(res.shortcut).toBe('deadline-exceeded');
  });

  it('deadline gates between stages when time advances', async () => {
    const p = new RpcPipeline({ clock });
    p.use((_r, _c, next) => {
      clock.advance(200); // burn past the 100ms deadline
      return next();
    });
    const res = await p.execute(req({ deadlineMs: 100 }));
    expect(res.status).toBe(504);
  });

  it('attributes flow to inner stages via ctx', async () => {
    const seen: unknown[] = [];
    const p = new RpcPipeline({ clock });
    p.use((r, ctx, next) => {
      ctx.attributes['route'] = 'r1';
      return next();
    });
    p.use((r, ctx, next) => {
      seen.push(ctx.attributes['route']);
      return next();
    });
    await p.execute(req(), async () => ok);
    expect(seen).toEqual(['r1']);
  });

  it('next(modifiedRequest) replaces the inbound request', async () => {
    let seenPath: string | undefined;
    const p = new RpcPipeline({ clock });
    p.use((r, _c, next) => next({ ...r, path: '/rewritten' }));
    await p.execute(req(), async (r) => {
      seenPath = r.path;
      return ok;
    });
    expect(seenPath).toBe('/rewritten');
  });

  it('trace records stage indices and resolution point', async () => {
    const p = new RpcPipeline({ clock });
    p.use((_r, _c, next) => next(), 'first');
    p.use((_r, _c, next) => next(), 'second');
    await p.execute(req(), async () => ok);
    const t = p.trace()!;
    expect(t.stages.length).toBe(2);
    expect(t.stages[0]!.name).toBe('first');
    expect(t.stages[1]!.name).toBe('second');
    expect(t.resolvedAt).toBe(2); // terminal index
  });

  it('headerInjectionStage prepends defaults', async () => {
    let seen: Readonly<Record<string, string>> | undefined;
    const p = new RpcPipeline({ clock });
    p.use(headerInjectionStage({ 'x-gw': 'edge-1' }));
    await p.execute(req({ headers: { a: '1' } }), async (r) => {
      seen = r.headers;
      return ok;
    });
    expect(seen).toEqual({ 'x-gw': 'edge-1', a: '1' });
  });

  it('deadlinePropagationStage pulls the deadline from headers', async () => {
    const p = new RpcPipeline({ clock });
    p.use(deadlinePropagationStage());
    let remaining: number | undefined;
    p.use((_r, ctx, next) => {
      remaining = ctx.deadlineRemainingMs;
      return next();
    });
    await p.execute(req({ headers: { 'x-deadline-ms': '555' } }), async () => ok);
    expect(remaining).toBe(555);
  });

  it('deadlinePropagationStage rejects malformed headers', async () => {
    const p = new RpcPipeline({ clock });
    p.use(deadlinePropagationStage());
    const res = await p.execute(req({ headers: { 'x-deadline-ms': 'soon' } }));
    expect(res.status).toBe(400);
  });

  it('idempotencyStage replays a stored response on duplicate', async () => {
    const store = new IdempotencyStore({ clock });
    const p = new RpcPipeline({ clock });
    p.use(idempotencyStage(store));
    let upstreamCalls = 0;
    const terminal = async (): Promise<RpcResult> => {
      upstreamCalls++;
      return { status: 201, headers: {}, body: '{"id":1}' };
    };
    const post = req({
      method: 'POST',
      headers: { 'idempotency-key': 'abc' },
      body: '{"a":1}',
    });
    const r1 = await p.execute(post, terminal);
    const r2 = await p.execute(post, terminal);
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r2.headers['x-idempotent-replay']).toBe('true');
    expect(upstreamCalls).toBe(1);
  });

  it('idempotencyStage conflicts on key reuse with different body', async () => {
    const store = new IdempotencyStore({ clock });
    const p = new RpcPipeline({ clock });
    p.use(idempotencyStage(store));
    const base = { method: 'POST', headers: { 'idempotency-key': 'k' } };
    await p.execute(req({ ...base, body: '1' }), async () => ok);
    const res = await p.execute(req({ ...base, body: '2' }), async () => ok);
    expect(res.status).toBe(422);
  });

  it('idempotencyStage skips non-mutating methods', async () => {
    const store = new IdempotencyStore({ clock });
    const p = new RpcPipeline({ clock });
    p.use(idempotencyStage(store));
    let calls = 0;
    const get = req({ method: 'GET', headers: { 'idempotency-key': 'g' } });
    await p.execute(get, async () => {
      calls++;
      return ok;
    });
    await p.execute(get, async () => {
      calls++;
      return ok;
    });
    expect(calls).toBe(2);
    expect(store.stats().entries).toBe(0);
  });
});
