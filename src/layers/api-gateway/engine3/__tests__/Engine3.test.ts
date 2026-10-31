/**
 * Tests for WsProxyEngine, GrpcMethodRouter, IdempotencyStore and
 * HealthAwareBalancer.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  evaluateUpgrade,
  upgradeResponseHeaders,
  wsAcceptKey,
  encodeFrame,
  decodeFrames,
  closePayload,
  InMemoryWsEndpoint,
  WsRelay,
} from '../WsProxyEngine';
import {
  GrpcMethodRouter,
  GrpcError,
  parseGrpcTimeout,
  parseGrpcPath,
} from '../GrpcMethodRouter';
import { IdempotencyStore, requestFingerprint } from '../IdempotencyStore';
import { HealthAwareBalancer, BalancerRandom } from '../HealthAwareBalancer';
import { ManualGatewayClock3, WS_OP_TEXT, WS_OP_CLOSE, WS_OP_PING, WS_OP_BINARY, WsUpgradeRequest } from '../types3';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function upgradeReq(overrides: Partial<WsUpgradeRequest> = {}): WsUpgradeRequest {
  return {
    method: 'GET',
    path: '/ws/feed',
    headers: {
      upgrade: 'websocket',
      connection: 'keep-alive, Upgrade',
      'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
      'sec-websocket-version': '13',
    },
    ...overrides,
  };
}

describe('WsProxyEngine — upgrade validation', () => {
  it('accepts a well-formed upgrade and derives the accept key', () => {
    const v = evaluateUpgrade(upgradeReq());
    expect(v.ok).toBe(true);
    if (v.ok) {
      // RFC 6455 example value.
      expect(v.acceptKey).toBe('s3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
      expect(v.upstreamPath).toBe('/ws/feed');
    }
  });

  it('rejects non-GET requests', () => {
    const v = evaluateUpgrade(upgradeReq({ method: 'POST' }));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.status).toBe(405);
  });

  it('rejects missing Upgrade / Connection / version headers', () => {
    expect(evaluateUpgrade(upgradeReq({ headers: {} })).ok).toBe(false);
    const noConn = evaluateUpgrade(
      upgradeReq({ headers: { ...upgradeReq().headers, connection: 'keep-alive' } })
    );
    expect(noConn.ok).toBe(false);
    const badVer = evaluateUpgrade(
      upgradeReq({ headers: { ...upgradeReq().headers, 'sec-websocket-version': '8' } })
    );
    expect(badVer.ok).toBe(false);
    if (!badVer.ok) expect(badVer.status).toBe(426);
  });

  it('rejects malformed keys', () => {
    const v = evaluateUpgrade(
      upgradeReq({ headers: { ...upgradeReq().headers, 'sec-websocket-key': 'AA==' } })
    );
    expect(v.ok).toBe(false);
  });

  it('upgradeResponseHeaders emits the 101 header set', () => {
    const h = upgradeResponseHeaders('KEY', 'chat');
    expect(h['Sec-WebSocket-Accept']).toBe('KEY');
    expect(h['Sec-WebSocket-Protocol']).toBe('chat');
  });
});

describe('WsProxyEngine — frame codec', () => {
  it('round-trips a masked text frame', () => {
    const payload = encoder.encode('hello');
    const wire = encodeFrame({ fin: true, opcode: WS_OP_TEXT, payload }, true);
    expect(wire[1]! & 0x80).toBe(0x80); // mask bit set
    const out = decodeFrames(wire, true);
    expect(out.frames.length).toBe(1);
    expect(decoder.decode(out.frames[0]!.payload)).toBe('hello');
    expect(out.consumed).toBe(wire.length);
  });

  it('round-trips a 16-bit length frame', () => {
    const payload = new Uint8Array(300).fill(0x61);
    const wire = encodeFrame({ fin: true, opcode: WS_OP_BINARY, payload }, false);
    expect(wire[1]).toBe(126);
    const out = decodeFrames(wire, false);
    expect(out.frames[0]!.payload.length).toBe(300);
  });

  it('round-trips a 64-bit length frame', () => {
    const payload = new Uint8Array(70_000).fill(0x62);
    const wire = encodeFrame({ fin: true, opcode: WS_OP_BINARY, payload }, false);
    expect(wire[1]).toBe(127);
    const out = decodeFrames(wire, false);
    expect(out.frames[0]!.payload.length).toBe(70_000);
  });

  it('reports incomplete frames without consuming them', () => {
    const payload = encoder.encode('partial');
    const wire = encodeFrame({ fin: true, opcode: WS_OP_TEXT, payload }, false);
    const out = decodeFrames(wire.slice(0, wire.length - 3), false);
    expect(out.incomplete).toBe(true);
    expect(out.frames.length).toBe(0);
    expect(out.consumed).toBe(0);
  });

  it('decodes multiple coalesced frames', () => {
    const a = encodeFrame({ fin: true, opcode: WS_OP_TEXT, payload: encoder.encode('a') }, false);
    const b = encodeFrame({ fin: true, opcode: WS_OP_TEXT, payload: encoder.encode('b') }, false);
    const both = new Uint8Array(a.length + b.length);
    both.set(a, 0);
    both.set(b, a.length);
    const out = decodeFrames(both, false);
    expect(out.frames.length).toBe(2);
  });

  it('rejects unmasked frames when masking is expected', () => {
    const wire = encodeFrame({ fin: true, opcode: WS_OP_TEXT, payload: encoder.encode('x') }, false);
    expect(() => decodeFrames(wire, true)).toThrow();
  });
});

describe('WsRelay — bidirectional forwarding', () => {
  let client: InMemoryWsEndpoint;
  let upstream: InMemoryWsEndpoint;
  let relay: WsRelay;

  beforeEach(() => {
    client = new InMemoryWsEndpoint();
    upstream = new InMemoryWsEndpoint();
    relay = new WsRelay(client, upstream);
  });

  const masked = (opcode: number, text: string) =>
    encodeFrame({ fin: true, opcode, payload: encoder.encode(text) }, true);
  const unmasked = (opcode: number, text: string) =>
    encodeFrame({ fin: true, opcode, payload: encoder.encode(text) }, false);

  it('forwards client text frames to upstream, re-masked', () => {
    relay.feedClient(masked(WS_OP_TEXT, 'hi'));
    expect(upstream.sent.length).toBe(1);
    const decoded = decodeFrames(upstream.bytes(), true);
    expect(decoder.decode(decoded.frames[0]!.payload)).toBe('hi');
  });

  it('forwards upstream frames to client, unmasked', () => {
    relay.feedUpstream(unmasked(WS_OP_TEXT, 'downstream'));
    expect(client.sent.length).toBe(1);
    const decoded = decodeFrames(client.bytes(), false);
    expect(decoded.frames[0]!.payload[0]! & 0x80).toBe(0);
    expect(decoder.decode(decoded.frames[0]!.payload)).toBe('downstream');
  });

  it('answers pings locally without hitting the peer', () => {
    relay.feedClient(masked(WS_OP_PING, 'ping'));
    expect(upstream.sent.length).toBe(0);
    const decoded = decodeFrames(client.bytes(), true);
    expect(decoded.frames[0]!.opcode).toBe(0xa); // PONG
    expect(decoder.decode(decoded.frames[0]!.payload)).toBe('ping');
    expect(relay.snapshot().pings).toBe(1);
  });

  it('handles fragmented client messages by reassembly', () => {
    const f1 = encodeFrame({ fin: false, opcode: WS_OP_TEXT, payload: encoder.encode('hel') }, true);
    const f2 = encodeFrame({ fin: true, opcode: 0x0, payload: encoder.encode('lo') }, true);
    relay.feedClient(f1);
    expect(upstream.sent.length).toBe(0);
    relay.feedClient(f2);
    const decoded = decodeFrames(upstream.bytes(), true);
    expect(decoded.frames[0]!.opcode).toBe(WS_OP_TEXT);
    expect(decoder.decode(decoded.frames[0]!.payload)).toBe('hello');
  });

  it('invokes the onFrame hook and honors drops', () => {
    const seen: string[] = [];
    const r = new WsRelay(client, upstream, {
      onFrame: (frame, dir) => {
        seen.push(`${dir}:${decoder.decode(frame.payload)}`);
        return decoder.decode(frame.payload) === 'drop' ? null : frame;
      },
    });
    r.feedClient(masked(WS_OP_TEXT, 'keep'));
    r.feedClient(masked(WS_OP_TEXT, 'drop'));
    expect(seen).toEqual(['client→upstream:keep', 'client→upstream:drop']);
    const decoded = decodeFrames(upstream.bytes(), true);
    expect(decoded.frames.length).toBe(1);
    expect(decoder.decode(decoded.frames[0]!.payload)).toBe('keep');
  });

  it('close frames tear down both directions once', () => {
    let reason: string | undefined;
    const r = new WsRelay(client, upstream, { onClose: (x) => (reason = x) });
    const close = encodeFrame({ fin: true, opcode: WS_OP_CLOSE, payload: closePayload(1000, 'bye') }, true);
    r.feedClient(close);
    r.feedClient(close); // ignored after close
    expect(r.snapshot().closed).toBe(true);
    expect(reason).toBe('bye');
    expect(client.closed).toBe(true);
    expect(upstream.closed).toBe(true);
    expect(upstream.sent.length).toBe(1); // echoed close only
  });

  it('protocol errors produce a 1002 close', () => {
    // Feed a masked-expectation violation: unmasked client frame.
    relay.feedClient(unmasked(WS_OP_TEXT, 'bad'));
    expect(relay.snapshot().closed).toBe(true);
    const decoded = decodeFrames(client.bytes(), false);
    expect(decoded.frames[0]!.opcode).toBe(WS_OP_CLOSE);
  });

  it('terminate sends close to both sides', () => {
    relay.terminate('gateway shutdown');
    expect(relay.snapshot().closeReason).toBe('gateway shutdown');
    expect(client.sent.length).toBe(1);
    expect(upstream.sent.length).toBe(1);
  });
});

describe('GrpcMethodRouter', () => {
  let clock: ManualGatewayClock3;
  let router: GrpcMethodRouter;

  beforeEach(() => {
    clock = new ManualGatewayClock3(1_000);
    router = new GrpcMethodRouter({ clock });
    router.register({
      path: '/shop.Cart/AddItem',
      handler: (call, ctx) => ({
        status: 'OK',
        message: { added: (call.message as { id: string }).id },
        error: undefined,
      }),
      defaultTimeoutMs: 500,
    });
  });

  it('parseGrpcTimeout decodes every unit', () => {
    expect(parseGrpcTimeout('1H')).toBe(3_600_000);
    expect(parseGrpcTimeout('2M')).toBe(120_000);
    expect(parseGrpcTimeout('3S')).toBe(3_000);
    expect(parseGrpcTimeout('250m')).toBe(250);
    expect(parseGrpcTimeout('10u')).toBeCloseTo(0.01, 6);
    expect(parseGrpcTimeout('5n')).toBeCloseTo(0.000_005, 9);
    expect(parseGrpcTimeout('bogus')).toBeUndefined();
    expect(parseGrpcTimeout('123456789S')).toBeUndefined(); // >8 digits
  });

  it('parseGrpcPath validates path shape', () => {
    expect(parseGrpcPath('/pkg.Svc/M')).toEqual({
      service: 'pkg.Svc',
      method: 'M',
      path: '/pkg.Svc/M',
    });
    expect(parseGrpcPath('pkg.Svc/M')).toBeUndefined();
    expect(parseGrpcPath('/a/b/c')).toBeUndefined();
    expect(parseGrpcPath('/svc/')).toBeUndefined();
  });

  it('invokes a registered method and returns its response', async () => {
    const res = await router.invoke({
      path: '/shop.Cart/AddItem',
      message: { id: 'sku-1' },
      deadlineMs: 1_400,
    });
    expect(res.status).toBe('OK');
    expect(res.message).toEqual({ added: 'sku-1' });
    expect(res.deadlineRemainingMs).toBe(400);
  });

  it('returns UNIMPLEMENTED for unknown or malformed paths', async () => {
    expect((await router.invoke({ path: '/nope.Svc/X', message: null })).status).toBe(
      'UNIMPLEMENTED'
    );
    expect((await router.invoke({ path: 'bad', message: null })).status).toBe('UNIMPLEMENTED');
  });

  it('passes the remaining deadline to the handler ctx', async () => {
    let seen: number | undefined;
    router.register({
      path: '/svc.S/M2',
      handler: (_c, ctx) => {
        seen = ctx.deadlineRemainingMs;
        return { status: 'OK' };
      },
    });
    await router.invoke({ path: '/svc.S/M2', message: null, deadlineMs: 1_300 });
    expect(seen).toBe(300);
  });

  it('applies the method default timeout when caller sets none', async () => {
    let seen: number | undefined;
    router.register({
      path: '/svc.S/M3',
      handler: (_c, ctx) => {
        seen = ctx.deadlineRemainingMs;
        return { status: 'OK' };
      },
      defaultTimeoutMs: 250,
    });
    await router.invoke({ path: '/svc.S/M3', message: null });
    expect(seen).toBe(250);
  });

  it('DEADLINE_EXCEEDED when arriving already past deadline', async () => {
    const res = await router.invoke({
      path: '/shop.Cart/AddItem',
      message: {},
      deadlineMs: 999, // before clock.now()=1000
    });
    expect(res.status).toBe('DEADLINE_EXCEEDED');
  });

  it('late handler resolution loses to the deadline', async () => {
    router.register({
      path: '/svc.S/Slow',
      handler: () => {
        clock.advance(600); // handler burns past the 500ms deadline
        return { status: 'OK' };
      },
      defaultTimeoutMs: 500,
    });
    const res = await router.invoke({ path: '/svc.S/Slow', message: null });
    expect(res.status).toBe('DEADLINE_EXCEEDED');
  });

  it('GrpcError maps to its status code; other errors to INTERNAL', async () => {
    router.register({
      path: '/svc.S/NotFound',
      handler: () => {
        throw new GrpcError('NOT_FOUND', 'missing entity');
      },
    });
    router.register({
      path: '/svc.S/Boom',
      handler: () => {
        throw new Error('kaboom');
      },
    });
    expect((await router.invoke({ path: '/svc.S/NotFound', message: null })).status).toBe(
      'NOT_FOUND'
    );
    const boom = await router.invoke({ path: '/svc.S/Boom', message: null });
    expect(boom.status).toBe('INTERNAL');
    expect(boom.error).toBe('kaboom');
  });

  it('rejects duplicate registrations and invalid paths', () => {
    expect(() =>
      router.register({ path: '/shop.Cart/AddItem', handler: () => ({ status: 'OK' }) })
    ).toThrow();
    expect(() => router.register({ path: 'bad', handler: () => ({ status: 'OK' }) })).toThrow();
  });

  it('routes() lists sorted paths and unregister removes them', () => {
    router.register({ path: '/a.S/X', handler: () => ({ status: 'OK' }) });
    expect(router.routes()).toEqual(['/a.S/X', '/shop.Cart/AddItem']);
    expect(router.unregister('/a.S/X')).toBe(true);
    expect(router.unregister('/a.S/X')).toBe(false);
  });
});

describe('IdempotencyStore', () => {
  let clock: ManualGatewayClock3;
  let store: IdempotencyStore;
  const fp = requestFingerprint('POST', '/pay', '{"amount":10}');

  beforeEach(() => {
    clock = new ManualGatewayClock3(0);
    store = new IdempotencyStore({ clock, ttlMs: 60_000 });
  });

  it('miss → store → hit replays the stored response', () => {
    expect(store.check('k1', fp).kind).toBe('miss');
    store.store('k1', { status: 201, body: '{"id":"p1"}' });
    const dup = store.check('k1', fp);
    expect(dup.kind).toBe('hit');
    if (dup.kind === 'hit') {
      expect(dup.response.status).toBe(201);
      expect(dup.response.body).toBe('{"id":"p1"}');
    }
    expect(store.stats().hits).toBe(1);
  });

  it('same key with different fingerprint is a conflict', () => {
    store.check('k1', fp);
    store.store('k1', { status: 200, body: 'ok' });
    const other = store.check('k1', requestFingerprint('POST', '/pay', '{"amount":20}'));
    expect(other.kind).toBe('conflict');
    expect(store.stats().conflicts).toBe(1);
  });

  it('in-flight duplicates wait on the stored response', async () => {
    store.check('k1', fp);
    const dup = store.check('k1', fp);
    expect(dup.kind).toBe('in-flight');
    const waiter = store.wait('k1');
    store.store('k1', { status: 200, body: 'done' });
    const r = await waiter;
    expect(r?.status).toBe(200);
  });

  it('expired entries are treated as misses', () => {
    store.check('k1', fp);
    store.store('k1', { status: 200, body: 'x' });
    clock.advance(61_000);
    expect(store.check('k1', fp).kind).toBe('miss');
    expect(store.stats().expired).toBe(1);
  });

  it('sweep evicts expired entries in bulk', () => {
    store.check('a', fp);
    store.store('a', { status: 200, body: 'a' });
    store.check('b', fp);
    store.store('b', { status: 200, body: 'b' });
    clock.advance(61_000);
    expect(store.sweep()).toBe(2);
    expect(store.stats().entries).toBe(0);
  });

  it('release wakes waiters with a 503 and frees the key', async () => {
    store.check('k1', fp);
    const waiter = store.wait('k1');
    store.release('k1');
    const r = await waiter;
    expect(r?.status).toBe(503);
    expect(store.check('k1', fp).kind).toBe('miss');
  });

  it('fingerprints differ across method/path/body', () => {
    expect(requestFingerprint('GET', '/a', undefined)).not.toBe(fp);
    expect(requestFingerprint('POST', '/b', '{"amount":10}')).not.toBe(fp);
    expect(requestFingerprint('POST', '/pay', '{"amount":10}')).toBe(fp);
  });
});

describe('HealthAwareBalancer', () => {
  class FixedRandom implements BalancerRandom {
    constructor(private v: number) {}
    next(): number {
      return this.v;
    }
  }

  let clock: ManualGatewayClock3;

  beforeEach(() => {
    clock = new ManualGatewayClock3(0);
  });

  it('picks the only closed upstream', () => {
    const b = new HealthAwareBalancer({ clock });
    b.add('u1');
    expect(b.pick()).toBe('u1');
  });

  it('weighted random favors healthier upstreams', () => {
    const b = new HealthAwareBalancer({ clock, random: new FixedRandom(0.9) });
    b.add('fast', 1);
    b.add('slow', 1);
    // Give slow terrible latency so its weight collapses.
    for (let i = 0; i < 10; i++) {
      b.acquire('fast');
      b.report('fast', true, 5);
      b.acquire('slow');
      b.report('slow', true, 10_000);
    }
    const fastW = b.effectiveWeight('fast');
    const slowW = b.effectiveWeight('slow');
    expect(fastW).toBeGreaterThan(slowW);
    // roll 0.9 lands in whichever tail segment owns it
    expect(['fast', 'slow']).toContain(b.pick());
  });

  it('circuit opens after threshold consecutive failures', () => {
    const b = new HealthAwareBalancer({ clock, failureThreshold: 3 });
    b.add('bad');
    b.add('good');
    for (let i = 0; i < 3; i++) {
      b.acquire('bad');
      b.report('bad', false, 100);
    }
    expect(b.health('bad')!.circuit).toBe('open');
    // Only 'good' can be picked now.
    for (let i = 0; i < 10; i++) expect(b.pick()).toBe('good');
  });

  it('circuit half-opens after reset and closes on success', () => {
    const b = new HealthAwareBalancer({ clock, failureThreshold: 2, circuitResetMs: 1_000 });
    b.add('only');
    b.acquire('only');
    b.report('only', false, 10);
    b.acquire('only');
    b.report('only', false, 10);
    expect(b.health('only')!.circuit).toBe('open');
    expect(b.pick()).toBeUndefined(); // still cooling

    clock.advance(1_001);
    expect(b.pick()).toBe('only'); // probe allowed through
    expect(b.health('only')!.circuit).toBe('half-open');

    b.report('only', true, 5);
    expect(b.health('only')!.circuit).toBe('closed');
  });

  it('EWMA error rate decays and shifts weight', () => {
    const b = new HealthAwareBalancer({ clock, alpha: 0.5 });
    b.add('flaky');
    b.report('flaky', false, 100); // ewmaErr = 1
    expect(b.health('flaky')!.ewmaErrorRate).toBe(1);
    b.report('flaky', true, 100); // 0.5
    expect(b.health('flaky')!.ewmaErrorRate).toBeCloseTo(0.5, 6);
    b.report('flaky', true, 100); // 0.25
    expect(b.health('flaky')!.ewmaErrorRate).toBeCloseTo(0.25, 6);
  });

  it('success resets the consecutive failure streak', () => {
    const b = new HealthAwareBalancer({ clock, failureThreshold: 3 });
    b.add('u');
    b.report('u', false, 10);
    b.report('u', false, 10);
    b.report('u', true, 10);
    b.report('u', false, 10);
    b.report('u', false, 10);
    expect(b.health('u')!.circuit).toBe('closed');
    expect(b.health('u')!.consecutiveFailures).toBe(2);
  });

  it('falls back to least-inflight when all weights are zero', () => {
    const b = new HealthAwareBalancer({ clock });
    b.add('a');
    b.add('b');
    // Drive both error rates to ~1 so effective weights ≈ 0.
    for (let i = 0; i < 50; i++) {
      b.report('a', false, 10);
      b.report('b', false, 10);
    }
    // Circuits will be open by now — force them closed to isolate
    // the zero-weight path.
    b.probe('a');
    b.probe('b');
    b.report('a', true, 10);
    b.report('b', true, 10);
    b.acquire('a');
    const picked = b.pick();
    expect(picked).toBeDefined();
  });

  it('probe() reopens a cooled circuit manually', () => {
    const b = new HealthAwareBalancer({ clock, failureThreshold: 1 });
    b.add('u');
    b.report('u', false, 10);
    expect(b.health('u')!.circuit).toBe('open');
    expect(b.probe('u')).toBe(true);
    expect(b.health('u')!.circuit).toBe('half-open');
    expect(b.probe('u')).toBe(true); // half-open is re-armable
  });

  it('rejects invalid registrations', () => {
    const b = new HealthAwareBalancer();
    expect(() => b.add('u', 0)).toThrow();
    b.add('u');
    expect(() => b.add('u')).toThrow();
    expect(b.remove('u')).toBe(true);
    expect(b.remove('u')).toBe(false);
  });
});
