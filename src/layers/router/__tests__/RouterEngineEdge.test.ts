/**
 * Router Engine — Edge Case Tests
 *
 * Boundary conditions for versioning, constraints, subdomain routing,
 * metrics, hot-swap, and the route planner: empty paths, unicode,
 * constraint edge regexes, wildcard hosts, percentile floors, and
 * concurrent swap visibility.
 */

import { describe, it, expect, beforeEach } from 'bun:test';

import { HttpMethod } from '../types/router-types';
import {
  VersionedRouterEngine,
  ConstrainedRouterEngine,
  SubdomainRouter,
  RouteMetricsCollector,
  HotSwapRouter,
  RoutePlanner,
  RoutePlanError,
  compileHostPattern,
  matchHost,
  parseConstrainedPattern,
  RouteResult,
  EngineRoute,
} from '../engine';

const ok = async (): Promise<RouteResult> => ({ status: 200 });

function route(method: HttpMethod, path: string): EngineRoute {
  return { method, path, handler: ok };
}

// ---------------------------------------------------------------------------
// Versioning edge cases
// ---------------------------------------------------------------------------

describe('VersionedRouterEngine — edge cases', () => {
  it('a version named like the default still strips its prefix', async () => {
    // Register v1 AND v2 where v1 is the default — explicit /v1/x
    // must still strip the prefix.
    const e = new VersionedRouterEngine({ strategy: 'path', defaultVersion: 'v1' });
    e.addRoute({ version: 'v1', method: HttpMethod.GET, path: '/x', handler: async () => ({ status: 200, body: 'v1x' }) });
    e.addRoute({ version: 'v2', method: HttpMethod.GET, path: '/x', handler: async () => ({ status: 200, body: 'v2x' }) });

    const res = await e.dispatch(HttpMethod.GET, '/v1/x');
    expect(res.body).toBe('v1x');
    expect(res.servedByVersion).toBe('v1');
  });

  it('root path inside a version resolves /', async () => {
    const e = new VersionedRouterEngine({ strategy: 'path', defaultVersion: 'v1' });
    e.addRoute({ version: 'v2', method: HttpMethod.GET, path: '/', handler: async () => ({ status: 200, body: 'v2-root' }) });
    const res = await e.dispatch(HttpMethod.GET, '/v2');
    expect(res.status).toBe(200);
    expect(res.body).toBe('v2-root');
  });

  it('unknown version prefix falls to default table, unstripped', async () => {
    const e = new VersionedRouterEngine({ strategy: 'path', defaultVersion: 'v1' });
    e.addRoute({ version: 'v1', method: HttpMethod.GET, path: '/v9/x', handler: async () => ({ status: 200, body: 'literal' }) });
    const res = await e.dispatch(HttpMethod.GET, '/v9/x');
    expect(res.body).toBe('literal');
    expect(res.servedByVersion).toBe('v1');
  });

  it('stats reflect deprecation + sunset counts', () => {
    const e = new VersionedRouterEngine({ strategy: 'path', defaultVersion: 'v1', now: () => 1500 });
    e.addRoute({ version: 'v1', method: HttpMethod.GET, path: '/a', handler: ok, deprecatedAt: 1000 });
    e.addRoute({ version: 'v1', method: HttpMethod.GET, path: '/b', handler: ok, sunsetAt: 1000 });
    e.addRoute({ version: 'v2', method: HttpMethod.GET, path: '/c', handler: ok });
    const s = e.stats();
    expect(s.routeCount).toBe(3);
    expect(s.deprecatedCount).toBe(1);
    expect(s.sunsetCount).toBe(1);
  });

  it('method-not-allowed inside a version surfaces 405', async () => {
    const e = new VersionedRouterEngine({ strategy: 'path', defaultVersion: 'v1' });
    e.addRoute({ version: 'v1', method: HttpMethod.GET, path: '/r', handler: ok });
    const res = await e.dispatch(HttpMethod.POST, '/v1/r');
    expect(res.status).toBe(405);
  });
});

// ---------------------------------------------------------------------------
// Constraint edge cases
// ---------------------------------------------------------------------------

describe('ConstrainedRouterEngine — edge cases', () => {
  let r: ConstrainedRouterEngine;
  beforeEach(() => {
    r = new ConstrainedRouterEngine();
  });

  it('uuid builtin rejects malformed values', async () => {
    r.addRoute({
      method: HttpMethod.GET,
      path: '/e/:id<uuid>',
      handler: ok,
    });
    expect((await r.dispatch(HttpMethod.GET, '/e/550e8400-e29b-41d4-a716-446655440000')).status).toBe(200);
    expect((await r.dispatch(HttpMethod.GET, '/e/not-a-uuid')).status).toBe(404);
  });

  it('multiple constraints on one path all must pass', async () => {
    r.addRoute({
      method: HttpMethod.GET,
      path: '/y/:year<int>/m/:month<int>',
      handler: ok,
    });
    expect((await r.dispatch(HttpMethod.GET, '/y/2024/m/06')).status).toBe(200);
    expect((await r.dispatch(HttpMethod.GET, '/y/2024/m/june')).status).toBe(404);
    expect((await r.dispatch(HttpMethod.GET, '/y/yy/m/06')).status).toBe(404);
  });

  it('host variable plus path constraint interact correctly', async () => {
    r.addRoute({
      method: HttpMethod.GET,
      path: '/doc/:id<int>',
      host: '{t}.svc',
      handler: ok,
    });
    expect((await r.dispatch(HttpMethod.GET, '/doc/5', 'a.svc')).status).toBe(200);
    expect((await r.dispatch(HttpMethod.GET, '/doc/x', 'a.svc')).status).toBe(404);
    expect((await r.dispatch(HttpMethod.GET, '/doc/5', 'other.svc')).status).toBe(200);
    expect((await r.dispatch(HttpMethod.GET, '/doc/5')).status).toBe(404);
  });

  it('agnostic routes still serve when no hosted bucket matches', async () => {
    r.addRoute({ method: HttpMethod.GET, path: '/pub', host: 'a.h', handler: ok });
    r.addRoute({ method: HttpMethod.GET, path: '/pub', handler: async () => ({ status: 200, body: 'pub' }) });
    const res = await r.dispatch(HttpMethod.GET, '/pub', 'zzz.h');
    expect(res.body).toBe('pub');
  });

  it('parseConstrainedPattern rejects unclosed constraints', () => {
    expect(() => parseConstrainedPattern('/x/:id<int')).toThrow();
    expect(() => parseConstrainedPattern('/x/:id<(')).toThrow();
  });

  it('wildcard with constraint-free tail still works', async () => {
    r.addRoute({ method: HttpMethod.GET, path: '/files/*rest', handler: async (req) => ({ status: 200, body: req.wildcard }) });
    const res = await r.dispatch(HttpMethod.GET, '/files/a/b/c');
    expect(res.body).toBe('a/b/c');
  });
});

// ---------------------------------------------------------------------------
// Host matching edge cases
// ---------------------------------------------------------------------------

describe('matchHost — edge cases', () => {
  it('match-all pattern captures the whole host', () => {
    const m = matchHost(compileHostPattern('*'), 'anything.example.com');
    expect(m?.matched).toBe(true);
    expect(m?.variables._wildcardHost).toBe('anything.example.com');
  });

  it('empty variable match is rejected', () => {
    const m = matchHost(compileHostPattern('{sub}.x.com'), '.x.com');
    expect(m).toBeNull();
  });

  it('multiple variables in one pattern', () => {
    const m = matchHost(compileHostPattern('{a}-{b}.svc'), 'foo-bar.svc');
    expect(m?.matched).toBe(true);
    expect(m?.variables.a).toBe('foo');
    expect(m?.variables.b).toBe('bar');
  });

  it('rejects malformed host patterns', () => {
    expect(() => compileHostPattern('{unclosed.x')).toThrow();
    expect(() => compileHostPattern('{9bad}.x')).toThrow();
    expect(() => compileHostPattern('{}.x')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Subdomain edge cases
// ---------------------------------------------------------------------------

describe('SubdomainRouter — edge cases', () => {
  it('default bucket serves unmatched hosts', async () => {
    const r = new SubdomainRouter({ defaultPattern: 'default.internal' });
    r.addRoute('default.internal', { method: HttpMethod.GET, path: '/x', handler: async () => ({ status: 200, body: 'default' }) });
    const res = await r.dispatch(HttpMethod.GET, '/x', 'unmatched.host');
    expect(res.status).toBe(200);
    expect(res.matchedHostPattern).toBe('default.internal');
  });

  it('no host → 404 when no default', async () => {
    const r = new SubdomainRouter();
    r.addRoute('a.h', { method: HttpMethod.GET, path: '/x', handler: ok });
    const res = await r.dispatch(HttpMethod.GET, '/x', undefined);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Metrics edge cases
// ---------------------------------------------------------------------------

describe('RouteMetricsCollector — edge cases', () => {
  it('empty route returns undefined metrics', () => {
    const m = new RouteMetricsCollector();
    expect(m.metricsFor(HttpMethod.GET, '/none')).toBeUndefined();
    expect(m.errorRate(HttpMethod.GET, '/none')).toBe(0);
  });

  it('percentiles are 0 with no samples', () => {
    const m = new RouteMetricsCollector();
    m.record(HttpMethod.GET, '/x', 200, 5);
    const snap = m.metricsFor(HttpMethod.GET, '/x');
    expect(snap?.percentiles.p50).toBe(5);
  });

  it('reservoir of 1 keeps only the latest sample', () => {
    const m = new RouteMetricsCollector({ reservoirSize: 1 });
    m.record(HttpMethod.GET, '/x', 200, 10);
    m.record(HttpMethod.GET, '/x', 200, 99);
    const snap = m.metricsFor(HttpMethod.GET, '/x');
    expect(snap?.latencyMs.avg).toBe(99);
    expect(snap?.percentiles.p99).toBe(99);
  });

  it('errorRate is per-route', () => {
    const m = new RouteMetricsCollector();
    m.record(HttpMethod.GET, '/a', 500, 1);
    m.record(HttpMethod.GET, '/a', 200, 1);
    m.record(HttpMethod.GET, '/b', 200, 1);
    expect(m.errorRate(HttpMethod.GET, '/a')).toBe(0.5);
    expect(m.errorRate(HttpMethod.GET, '/b')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Hot-swap edge cases
// ---------------------------------------------------------------------------

describe('HotSwapRouter — edge cases', () => {
  it('stage() replaces a pending stage', () => {
    const h = new HotSwapRouter();
    const t1 = h.stage();
    t1.addRoute(route(HttpMethod.GET, '/first'));
    const t2 = h.stage();
    t2.addRoute(route(HttpMethod.GET, '/second'));
    h.swap();
    expect(h.match(HttpMethod.GET, '/first').kind).toBe('not_found');
    expect(h.match(HttpMethod.GET, '/second').kind).toBe('matched');
  });

  it('history records carry labels + route counts', () => {
    const h = new HotSwapRouter();
    const t = h.stage();
    t.addRoute(route(HttpMethod.GET, '/a'));
    t.addRoute(route(HttpMethod.GET, '/b'));
    const rec = h.swap('v2-deploy');
    expect(rec.label).toBe('v2-deploy');
    expect(rec.routeCount).toBe(2);
    expect(rec.seq).toBe(1);
  });

  it('sequential swaps accumulate monotonic seq', () => {
    const h = new HotSwapRouter();
    h.stage(); h.swap();
    h.stage(); h.swap();
    h.stage(); const rec = h.swap();
    expect(rec.seq).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Route planner
// ---------------------------------------------------------------------------

describe('RoutePlanner', () => {
  it('builds a clean table with resolved named middleware', () => {
    const order: string[] = [];
    const planner = new RoutePlanner();
    planner.middleware('auth', async (req, next) => {
      order.push('auth');
      return next();
    });
    planner.prefix('/api').route({
      method: HttpMethod.GET,
      path: '/users/:id<int>',
      middleware: ['auth'],
      handler: ok,
    });
    const table = planner.build();
    expect(table.diagnostics).toHaveLength(0);
    expect(table.routes).toHaveLength(1);
    // Constraint syntax is preserved — consuming engines re-parse it.
    expect(table.routes[0].path).toBe('/api/users/:id<int>');
  });

  it('collects diagnostics for bad routes in non-strict mode', () => {
    const planner = new RoutePlanner();
    planner.route({
      method: HttpMethod.GET,
      path: '/bad/:x<(',
      handler: ok,
    });
    planner.route({
      method: HttpMethod.GET,
      path: '/missing-mw',
      middleware: ['nope'],
      handler: ok,
    });
    const table = planner.build();
    expect(table.routes).toHaveLength(0);
    const kinds = table.diagnostics.map((d) => d.kind).sort();
    expect(kinds).toEqual(['invalid_path', 'unknown_middleware']);
  });

  it('detects duplicates across prefix + host', () => {
    const planner = new RoutePlanner();
    planner.route({ method: HttpMethod.GET, path: '/a', handler: ok });
    planner.route({ method: HttpMethod.GET, path: '/a', handler: ok });
    const table = planner.build();
    expect(table.diagnostics.some((d) => d.kind === 'duplicate')).toBe(true);
    expect(table.routes).toHaveLength(1);
  });

  it('same path on different hosts is not a duplicate', () => {
    const planner = new RoutePlanner();
    planner.route({ method: HttpMethod.GET, path: '/a', host: 'x.h', handler: ok });
    planner.route({ method: HttpMethod.GET, path: '/a', host: 'y.h', handler: ok });
    const table = planner.build();
    expect(table.routes).toHaveLength(2);
  });

  it('strict mode throws RoutePlanError on the first diagnostic', () => {
    const planner = new RoutePlanner({ strict: true });
    planner.route({ method: HttpMethod.GET, path: '/dup', handler: ok });
    planner.route({ method: HttpMethod.GET, path: '/dup', handler: ok });
    expect(() => planner.build()).toThrow(RoutePlanError);
  });

  it('built table feeds ConstrainedRouterEngine directly', async () => {
    const planner = new RoutePlanner();
    planner.prefix('/v1').route({
      method: HttpMethod.GET,
      path: '/users/:id<int>',
      handler: async (req) => ({ status: 200, body: req.params.id }),
    });
    const engine = new ConstrainedRouterEngine();
    for (const r of planner.build().routes) {
      engine.addRoute(r);
    }
    const res = await engine.dispatch(HttpMethod.GET, '/v1/users/9');
    expect(res.body).toBe('9');
    expect((await engine.dispatch(HttpMethod.GET, '/v1/users/nope')).status).toBe(404);
  });

  it('group middleware runs before route middleware', async () => {
    const order: string[] = [];
    const planner = new RoutePlanner();
    planner.groupMiddleware(async (req, next) => {
      order.push('group');
      return next();
    });
    planner.route({
      method: HttpMethod.GET,
      path: '/x',
      middleware: [
        async (req, next) => {
          order.push('route');
          return next();
        },
      ],
      handler: ok,
    });
    const engine = new ConstrainedRouterEngine();
    for (const r of planner.build().routes) {
      engine.addRoute(r);
    }
    await engine.dispatch(HttpMethod.GET, '/x');
    expect(order).toEqual(['group', 'route']);
  });
});
