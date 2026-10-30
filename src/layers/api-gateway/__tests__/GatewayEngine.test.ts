/**
 * Gateway engine component tests: TransformPipeline, ApiKeyManager,
 * TokenBucketRateLimiter, CircuitBreakerRegistry, AccessLogger,
 * GatewayResponseCache and end-to-end GatewayEngine.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { TransformPipeline } from '../engine/TransformPipeline';
import { ApiKeyManager } from '../engine/ApiKeyManager';
import { TokenBucketRateLimiter } from '../engine/RateLimiter';
import { CircuitBreakerRegistry, CircuitOpenError } from '../engine/CircuitBreaker';
import { AccessLogger, maskValue, maskHeaders } from '../engine/PiiMaskingLogger';
import { GatewayResponseCache } from '../engine/ResponseCache';
import { GatewayEngine } from '../engine/GatewayEngine';
import type {
  GatewayRequest,
  GatewayRoute,
  RouteMatch,
  GatewayClock,
  GatewayResponse,
} from '../engine/types';

class FakeClock implements GatewayClock {
  t = 1_000_000;
  now(): number {
    return this.t;
  }
  advance(ms: number): void {
    this.t += ms;
  }
}

function makeRequest(partial: Partial<GatewayRequest>): GatewayRequest {
  return {
    id: partial.id ?? 'req-1',
    method: 'GET',
    path: '/x',
    query: {},
    headers: {},
    metadata: {},
    ...partial,
  };
}

function makeMatch(partial?: Partial<GatewayRoute>): RouteMatch {
  return {
    route: {
      id: 'r',
      methods: [],
      pathPattern: '/x/:id',
      upstreams: [{ name: 'up', baseUrl: 'http://svc' }],
      ...partial,
    },
    params: { id: '42' },
    upstream: { name: 'up', baseUrl: 'http://svc' },
  };
}

describe('TransformPipeline', () => {
  const pipe = new TransformPipeline();

  it('sets, rewrites and removes headers', () => {
    const req = makeRequest({
      headers: { 'x-old': ['v'], 'x-remove': ['x'] },
    });
    const match = makeMatch({
      transforms: [
        { target: 'header:x-new', value: 'added' },
        { target: 'header:x-remove' },
        { target: 'header:x-tenant', value: 'tenant-{id}' },
      ],
    });
    const out = pipe.applyRequest(req, match, 'http://svc/x');
    expect(out.request.headers['x-new']).toEqual(['added']);
    expect(out.request.headers['x-remove']).toBeUndefined();
    expect(out.request.headers['x-tenant']).toEqual(['tenant-42']);
    // original untouched
    expect(req.headers['x-remove']).toEqual(['x']);
  });

  it('rewrites query params', () => {
    const req = makeRequest({ query: { keep: '1', drop: 'x' } });
    const match = makeMatch({
      transforms: [
        { target: 'query:lang', value: 'en' },
        { target: 'query:drop' },
      ],
    });
    const out = pipe.applyRequest(req, match, 'http://svc/x');
    expect(out.request.query).toEqual({ keep: '1', lang: 'en' });
  });

  it('rewrites upstream path with params', () => {
    const req = makeRequest({ path: '/x/42' });
    const match = makeMatch({
      transforms: [{ target: 'upstream-path', value: '/internal/users/{id}' }],
    });
    const out = pipe.applyRequest(req, match, 'http://svc/x/42');
    expect(out.request.upstreamPath).toBe('/internal/users/42');
  });

  it('applies conditional rules only when condition matches', () => {
    const req = makeRequest({ headers: { 'x-env': ['prod'] } });
    const match = makeMatch({
      transforms: [
        {
          target: 'header:x-debug',
          value: '1',
          when: { source: 'header', name: 'x-env', equals: 'dev' },
        },
        {
          target: 'header:x-flag',
          value: 'yes',
          when: { source: 'param', name: 'id', matches: /^4/ },
        },
      ],
    });
    const out = pipe.applyRequest(req, match, 'http://svc/x');
    expect(out.request.headers['x-debug']).toBeUndefined();
    expect(out.request.headers['x-flag']).toEqual(['yes']);
  });

  it('rewrites response headers', () => {
    const match = makeMatch({
      responseTransforms: [
        { target: 'header:x-powered-by' },
        { target: 'header:x-gw', value: 'omhw' },
      ],
    });
    const resp: GatewayResponse = {
      status: 200,
      headers: { 'x-powered-by': ['php'], 'content-type': ['text/plain'] },
    };
    const out = pipe.applyResponse(resp, match, {});
    expect(out.headers['x-powered-by']).toBeUndefined();
    expect(out.headers['x-gw']).toEqual(['omhw']);
  });
});

describe('ApiKeyManager', () => {
  let clock: FakeClock;
  let mgr: ApiKeyManager;

  beforeEach(() => {
    clock = new FakeClock();
    mgr = new ApiKeyManager(clock);
    mgr.registerConsumer({ id: 'c1', name: 'Consumer One', activeKeyIds: [] });
  });

  it('issues and verifies keys', () => {
    const { rawKey, record } = mgr.issue({ consumerId: 'c1' });
    expect(rawKey.startsWith('gw_')).toBe(true);
    const v = mgr.verify(rawKey);
    expect(v.ok).toBe(true);
    expect(v.key?.prefix).toBe(record.prefix);
  });

  it('rejects malformed and unknown keys', () => {
    expect(mgr.verify('not-a-key').reason).toBe('malformed');
    expect(mgr.verify('gw_abcdefgh.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa').reason).toBe('unknown');
  });

  it('rejects wrong secret for existing prefix', () => {
    const { rawKey } = mgr.issue({ consumerId: 'c1' });
    const prefix = rawKey.split('.')[0]!;
    const bad = `${prefix}.WRONGWRONGWRONGWRONGWRONGWRONGWRONGWRONGWRONG00`;
    expect(mgr.verify(bad).ok).toBe(false);
  });

  it('expires keys past TTL', () => {
    const { rawKey } = mgr.issue({ consumerId: 'c1', expiresInMs: 1000 });
    clock.advance(2000);
    expect(mgr.verify(rawKey).reason).toBe('expired');
  });

  it('rotation keeps old key valid during grace, then expires it', () => {
    const { rawKey } = mgr.issue({ consumerId: 'c1' });
    const rotated = mgr.rotate(rawKey, 5000);
    expect(rotated.rawKey).not.toBe(rawKey);
    // Both work during grace
    expect(mgr.verify(rawKey).ok).toBe(true);
    expect(mgr.verify(rotated.rawKey).ok).toBe(true);
    clock.advance(6000);
    expect(mgr.verify(rawKey).reason).toBe('expired');
    expect(mgr.verify(rotated.rawKey).ok).toBe(true);
  });

  it('revokes keys', () => {
    const { rawKey, record } = mgr.issue({ consumerId: 'c1' });
    expect(mgr.revoke(record.prefix)).toBe(true);
    expect(mgr.verify(rawKey).reason).toBe('revoked');
  });

  it('sweeps revoked keys', () => {
    const { record } = mgr.issue({ consumerId: 'c1' });
    mgr.revoke(record.prefix);
    expect(mgr.sweep()).toBe(1);
    expect(mgr.size()).toBe(0);
  });

  it('lists keys per consumer', () => {
    mgr.issue({ consumerId: 'c1' });
    mgr.issue({ consumerId: 'c1' });
    expect(mgr.keysForConsumer('c1').length).toBe(2);
  });

  it('throws on rotation of unknown key', () => {
    expect(() => mgr.rotate('gw_abcdefgh.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toThrow();
  });
});

describe('TokenBucketRateLimiter', () => {
  let clock: FakeClock;
  let limiter: TokenBucketRateLimiter;
  const policy = { burstCapacity: 3, refillPerSecond: 1, emitRetryAfter: true };

  beforeEach(() => {
    clock = new FakeClock();
    limiter = new TokenBucketRateLimiter(clock);
  });

  it('allows up to burst then rejects with retry-after', () => {
    for (let i = 0; i < 3; i++) {
      expect(limiter.consume('k', policy).allowed).toBe(true);
    }
    const d = limiter.consume('k', policy);
    expect(d.allowed).toBe(false);
    expect(d.retryAfterSeconds).toBe(1);
  });

  it('refills over time', () => {
    limiter.consume('k', policy);
    limiter.consume('k', policy);
    limiter.consume('k', policy);
    clock.advance(2000); // +2 tokens
    expect(limiter.consume('k', policy).allowed).toBe(true);
    expect(limiter.consume('k', policy).allowed).toBe(true);
    expect(limiter.consume('k', policy).allowed).toBe(false);
  });

  it('caps refill at burst capacity', () => {
    clock.advance(10_000);
    expect(limiter.consume('k', policy).remainingTokens).toBe(2);
  });

  it('keeps buckets independent per key', () => {
    limiter.consume('a', policy);
    limiter.consume('a', policy);
    limiter.consume('a', policy);
    expect(limiter.consume('b', policy).allowed).toBe(true);
  });

  it('sweeps idle full buckets', () => {
    limiter.consume('a', policy);
    clock.advance(100_000);
    expect(limiter.sweep(50_000)).toBe(1);
    expect(limiter.size()).toBe(0);
  });
});

describe('CircuitBreakerRegistry', () => {
  let clock: FakeClock;
  let reg: CircuitBreakerRegistry;
  const cfg = { failureThreshold: 2, openDurationMs: 5000, halfOpenMaxCalls: 1, halfOpenSuccessThreshold: 1 };

  beforeEach(() => {
    clock = new FakeClock();
    reg = new CircuitBreakerRegistry(cfg, clock);
  });

  it('opens after threshold failures and rejects fast', () => {
    reg.admit('up');
    reg.onFailure('up');
    reg.admit('up');
    reg.onFailure('up');
    expect(reg.stats('up').state).toBe('open');
    expect(() => reg.admit('up')).toThrow(CircuitOpenError);
  });

  it('transitions open -> half-open -> closed', () => {
    reg.admit('up');
    reg.onFailure('up');
    reg.admit('up');
    reg.onFailure('up');
    clock.advance(6000);
    reg.admit('up'); // half-open probe admitted
    reg.onSuccess('up');
    expect(reg.stats('up').state).toBe('closed');
  });

  it('re-opens on half-open failure', () => {
    reg.admit('up');
    reg.onFailure('up');
    reg.admit('up');
    reg.onFailure('up');
    clock.advance(6000);
    reg.admit('up');
    reg.onFailure('up');
    expect(reg.stats('up').state).toBe('open');
  });

  it('limits concurrent half-open probes', () => {
    reg.admit('up');
    reg.onFailure('up');
    reg.admit('up');
    reg.onFailure('up');
    clock.advance(6000);
    reg.admit('up'); // in-flight probe
    expect(() => reg.admit('up')).toThrow(CircuitOpenError);
  });

  it('resets consecutive failure count on success', () => {
    reg.admit('up');
    reg.onFailure('up');
    reg.admit('up');
    reg.onSuccess('up');
    reg.admit('up');
    reg.onFailure('up');
    expect(reg.stats('up').state).toBe('closed');
  });

  it('notifies transition listeners', () => {
    const seen: string[] = [];
    reg.onTransition((name, from, to) => seen.push(`${name}:${from}->${to}`));
    reg.admit('up');
    reg.onFailure('up');
    reg.admit('up');
    reg.onFailure('up');
    expect(seen).toEqual(['up:closed->open']);
  });
});

describe('PII masking & AccessLogger', () => {
  it('masks configured header names', () => {
    const out = maskHeaders(
      { authorization: ['Bearer sekret'], 'x-other': ['v'] },
      { maskedHeaders: ['authorization'], maskedFields: [], replacement: '***', bodyPatterns: [] }
    );
    expect(out['authorization']).toEqual(['***']);
    expect(out['x-other']).toEqual(['v']);
  });

  it('masks body fields at any depth and PII patterns', () => {
    const body = {
      user: { email: 'a@b.com', name: 'n' },
      password: 'hunter2',
      notes: 'call 4111111111111111',
      list: [{ token: 'abc' }],
    };
    const out = maskValue(body, {
      maskedHeaders: [],
      maskedFields: ['password', 'token', 'email'],
      replacement: '***',
      bodyPatterns: [/\b\d{13,19}\b/g],
    }) as Record<string, unknown>;
    expect(out['password']).toBe('***');
    expect((out['user'] as Record<string, unknown>)['email']).toBe('***');
    expect((out['list'] as Record<string, unknown>[])[0]!['token']).toBe('***');
    expect(String(out['notes'])).toContain('***');
  });

  it('handles circular structures', () => {
    const a: Record<string, unknown> = { x: 1 };
    a['self'] = a;
    const out = maskValue(a, { maskedHeaders: [], maskedFields: [], replacement: '***', bodyPatterns: [] }) as Record<string, unknown>;
    expect(out['self']).toBe('[Circular]');
  });

  it('logs masked entries and retrieves by request id', () => {
    const clock = new FakeClock();
    const logger = new AccessLogger({ capacity: 5, clock });
    logger.record({
      requestId: 'r1',
      method: 'GET',
      path: '/x',
      status: 200,
      headers: { authorization: ['Bearer T'], 'x-a': ['1'] },
      body: { password: 'p' },
    });
    const e = logger.getByRequestId('r1')!;
    expect(e.headers['authorization']).toEqual(['***']);
    expect((e.body as Record<string, unknown>)['password']).toBe('***');
    expect(e.headers['x-a']).toEqual(['1']);
  });

  it('evicts oldest when ring buffer is full', () => {
    const clock = new FakeClock();
    const logger = new AccessLogger({ capacity: 2, clock });
    for (const id of ['a', 'b', 'c']) {
      logger.record({ requestId: id, method: 'G', path: '/', headers: {} });
    }
    expect(logger.size()).toBe(2);
    expect(logger.getByRequestId('a')).toBeUndefined();
    expect(logger.entries().map((e) => e.requestId)).toEqual(['b', 'c']);
  });
});

describe('GatewayResponseCache', () => {
  let clock: FakeClock;
  let cache: GatewayResponseCache;
  const lookup = {
    routeId: 'r1',
    consumerId: 'c1',
    method: 'GET',
    path: '/x',
    query: { a: '1' },
    headers: {} as Record<string, string[]>,
  };
  const resp: GatewayResponse = { status: 200, headers: {}, body: 'data' };

  beforeEach(() => {
    clock = new FakeClock();
    cache = new GatewayResponseCache({ capacity: 3, defaultTtlMs: 1000, clock });
  });

  it('stores and hits', () => {
    expect(cache.set(lookup, resp)).toBe(true);
    const got = cache.get(lookup);
    expect(got?.body).toBe('data');
    expect(cache.stats().hits).toBe(1);
  });

  it('misses and expires by TTL', () => {
    cache.set(lookup, resp, 500);
    clock.advance(600);
    expect(cache.get(lookup)).toBeUndefined();
  });

  it('keys differ per consumer', () => {
    cache.set(lookup, resp);
    expect(cache.get({ ...lookup, consumerId: 'c2' })).toBeUndefined();
  });

  it('honors Vary header', () => {
    const varyResp: GatewayResponse = { status: 200, headers: { vary: ['Accept-Language'] } };
    cache.set(
      { ...lookup, headers: { 'accept-language': ['en'] } },
      varyResp
    );
    // same language hits
    expect(
      cache.get({ ...lookup, headers: { 'accept-language': ['en'] } })
    ).toBeDefined();
    // different language misses
    expect(
      cache.get({ ...lookup, headers: { 'accept-language': ['fr'] } })
    ).toBeUndefined();
  });

  it('does not store no-store responses', () => {
    const r: GatewayResponse = { status: 200, headers: { 'cache-control': ['no-store'] } };
    expect(cache.set(lookup, r)).toBe(false);
  });

  it('evicts LRU at capacity', () => {
    const l = (q: string) => ({ ...lookup, query: { a: q } });
    cache.set(l('1'), resp);
    cache.set(l('2'), resp);
    cache.set(l('3'), resp);
    cache.get(l('1')); // make 1 most recent
    cache.set(l('4'), resp); // evicts '2'
    expect(cache.get(l('2'))).toBeUndefined();
    expect(cache.get(l('1'))).toBeDefined();
    expect(cache.stats().evictions).toBe(1);
  });

  it('invalidates by base key', () => {
    cache.set(lookup, resp);
    expect(cache.invalidate(lookup)).toBe(1);
    expect(cache.get(lookup)).toBeUndefined();
  });
});

describe('GatewayEngine end-to-end', () => {
  let clock: FakeClock;
  let upstreamCalls: Array<{ path: string; headers: Record<string, string[]> }>;
  let engine: GatewayEngine;
  let apiKey: string;

  const baseRoute: GatewayRoute = {
    id: 'users',
    methods: ['GET'],
    pathPattern: '/api/users/:id',
    upstreams: [{ name: 'svc', baseUrl: 'http://svc' }],
    cacheable: true,
    cacheTtlMs: 60_000,
  };

  beforeEach(() => {
    clock = new FakeClock();
    upstreamCalls = [];
    engine = new GatewayEngine(async (input) => {
      upstreamCalls.push({ path: input.path, headers: input.headers });
      return { status: 200, headers: {}, body: { ok: true } };
    }, { clock });
    engine.addConsumer({ id: 'c1', name: 'One', activeKeyIds: [] });
    apiKey = engine.keys.issue({ consumerId: 'c1' }).rawKey;
    engine.addRoute(baseRoute);
  });

  const req = (path: string, headers: Record<string, string[]> = {}): GatewayRequest =>
    makeRequest({ id: GatewayEngine.nextRequestId(), path, headers });

  it('rejects missing key, then proxies with valid key', async () => {
    const anon = await engine.handle(req('/api/users/1'));
    expect(anon.status).toBe(401);
    const ok = await engine.handle(req('/api/users/1', { 'x-api-key': [apiKey] }));
    expect(ok.status).toBe(200);
    expect(ok.outcome).toBe('ok');
    expect(upstreamCalls.length).toBe(1);
  });

  it('serves second GET from cache', async () => {
    const h = { 'x-api-key': [apiKey] };
    await engine.handle(req('/api/users/1', h));
    const second = await engine.handle(req('/api/users/1', h));
    expect(second.outcome).toBe('cache-hit');
    expect(upstreamCalls.length).toBe(1);
  });

  it('returns 404 for unmatched path', async () => {
    const r = await engine.handle(req('/nope', { 'x-api-key': [apiKey] }));
    expect(r.status).toBe(404);
    expect(r.outcome).toBe('not-found');
  });

  it('rate limits per consumer', async () => {
    engine.addConsumer({
      id: 'c2',
      name: 'Two',
      activeKeyIds: [],
      rateLimit: { burstCapacity: 1, refillPerSecond: 0.01, emitRetryAfter: true },
    });
    const key2 = engine.keys.issue({ consumerId: 'c2' }).rawKey;
    const h = { 'x-api-key': [key2] };
    await engine.handle(req('/api/users/1', h));
    engine.cache.clear();
    const limited = await engine.handle(req('/api/users/2', h));
    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
  });

  it('opens the circuit after upstream 5xx and fails fast', async () => {
    const failing = new GatewayEngine(async () => {
      return { status: 500, headers: {} };
    }, {
      clock,
      circuit: { failureThreshold: 2, openDurationMs: 60_000, halfOpenMaxCalls: 1 },
    });
    failing.addConsumer({ id: 'c1', name: 'One', activeKeyIds: [] });
    const k = failing.keys.issue({ consumerId: 'c1' }).rawKey;
    failing.addRoute({ ...baseRoute, cacheable: false });
    const h = { 'x-api-key': [k] };
    await failing.handle(makeRequest({ id: 'a', path: '/api/users/1', headers: h }));
    await failing.handle(makeRequest({ id: 'b', path: '/api/users/1', headers: h }));
    const third = await failing.handle(makeRequest({ id: 'c', path: '/api/users/1', headers: h }));
    expect(third.status).toBe(503);
    expect(third.outcome).toBe('circuit-open');
  });

  it('applies request transforms before proxying', async () => {
    engine.addRoute({
      ...baseRoute,
      id: 'hdr',
      pathPattern: '/api/hdr',
      cacheable: false,
      transforms: [{ target: 'header:x-added', value: 'yes' }],
    });
    await engine.handle(makeRequest({ id: 't', path: '/api/hdr', headers: { 'x-api-key': [apiKey] } }));
    expect(upstreamCalls.at(-1)?.headers['x-added']).toEqual(['yes']);
  });

  it('records masked access logs', async () => {
    await engine.handle(req('/api/users/1', { 'x-api-key': [apiKey] }));
    const entries = engine.logger.entries();
    expect(entries.length).toBe(1);
    expect(entries[0]!.headers['x-api-key']).toEqual(['***']);
    expect(entries[0]!.routeId).toBe('users');
  });
});
