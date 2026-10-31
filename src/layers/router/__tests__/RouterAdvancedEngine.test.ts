/**
 * Router Advanced Engine Tests
 *
 * Covers: route versioning (path/header strategies, deprecation,
 * sunset, fallback), param constraints, host matching, subdomain
 * dispatch, per-route metrics (hits, latency percentiles, error rate),
 * and atomic route-table hot-swap.
 */

import { describe, it, expect, beforeEach } from 'bun:test';

import { HttpMethod } from '../types/router-types';
import {
  VersionedRouterEngine,
  ConstrainedRouterEngine,
  SubdomainRouter,
  RouteMetricsCollector,
  HotSwapRouter,
  stageRoutes,
  compileHostPattern,
  matchHost,
  parseConstrainedPattern,
  RouteResult,
  EngineRoute,
} from '../engine';

const ok = async (): Promise<RouteResult> => ({ status: 200, body: 'ok' });

function route(method: HttpMethod, path: string, body: string = path): EngineRoute {
  return {
    method,
    path,
    handler: async (): Promise<RouteResult> => ({ status: 200, body }),
  };
}

function vroute(
  version: string,
  method: HttpMethod,
  path: string,
  extra?: Partial<Parameters<VersionedRouterEngine['addRoute']>[0]>
) {
  return { version, method, path, handler: ok, ...extra };
}

// ---------------------------------------------------------------------------
// Route versioning
// ---------------------------------------------------------------------------

describe('VersionedRouterEngine', () => {
  let engine: VersionedRouterEngine;

  beforeEach(() => {
    engine = new VersionedRouterEngine({
      strategy: 'path',
      defaultVersion: 'v1',
      now: () => 1000,
    });
  });

  it('routes to the version selected by the first path segment', async () => {
    engine.addRoute(vroute('v1', HttpMethod.GET, '/users', { handler: async () => ({ status: 200, body: 'v1-users' }) }));
    engine.addRoute(vroute('v2', HttpMethod.GET, '/users', { handler: async () => ({ status: 200, body: 'v2-users' }) }));

    const v1 = await engine.dispatch(HttpMethod.GET, '/v1/users');
    expect(v1.status).toBe(200);
    expect(v1.body).toBe('v1-users');
    expect(v1.servedByVersion).toBe('v1');

    const v2 = await engine.dispatch(HttpMethod.GET, '/v2/users');
    expect(v2.status).toBe(200);
    expect(v2.body).toBe('v2-users');
    expect(v2.servedByVersion).toBe('v2');
  });

  it('serves the default version when no prefix is present', async () => {
    engine.addRoute(vroute('v1', HttpMethod.GET, '/users', { handler: async () => ({ status: 200, body: 'default' }) }));
    const res = await engine.dispatch(HttpMethod.GET, '/users');
    expect(res.status).toBe(200);
    expect(res.servedByVersion).toBe('v1');
  });

  it('404s for unknown paths inside a known version', async () => {
    engine.addRoute(vroute('v1', HttpMethod.GET, '/known'));
    const res = await engine.dispatch(HttpMethod.GET, '/v1/unknown');
    expect(res.status).toBe(404);
  });

  it('header strategy resolves versions from x-api-version', async () => {
    const headerEngine = new VersionedRouterEngine({
      strategy: 'header',
      defaultVersion: 'v1',
      now: () => 0,
    });
    headerEngine.addRoute(vroute('v1', HttpMethod.GET, '/users', { handler: async () => ({ status: 200, body: 'v1' }) }));
    headerEngine.addRoute(vroute('v2', HttpMethod.GET, '/users', { handler: async () => ({ status: 200, body: 'v2' }) }));

    const res = await headerEngine.dispatch(HttpMethod.GET, '/users', { 'x-api-version': 'v2' });
    expect(res.status).toBe(200);
    expect(res.body).toBe('v2');
    expect(res.servedByVersion).toBe('v2');
  });

  it('marks routes deprecated once deprecatedAt passes', async () => {
    engine.addRoute(
      vroute('v1', HttpMethod.GET, '/old', {
        deprecatedAt: 500,
        sunsetAt: 2000,
        successor: '/v2/old',
      })
    );
    const res = await engine.dispatch(HttpMethod.GET, '/v1/old');
    expect(res.status).toBe(200);
    expect(res.deprecation.deprecated).toBe(true);
    expect(res.deprecation.sunset).toBe(false);
    expect(res.headers?.deprecation).toBe('true');
    expect(res.headers?.sunset).toBeDefined();
    expect(res.headers?.link).toContain('successor-version');
  });

  it('returns 410 Gone once sunsetAt passes', async () => {
    const sunsetEngine = new VersionedRouterEngine({
      strategy: 'path',
      defaultVersion: 'v1',
      now: () => 5000,
    });
    sunsetEngine.addRoute(
      vroute('v1', HttpMethod.GET, '/sunset', {
        deprecatedAt: 500,
        sunsetAt: 2000,
        successor: '/v2/sunset',
      })
    );
    const res = await sunsetEngine.dispatch(HttpMethod.GET, '/v1/sunset');
    expect(res.status).toBe(410);
    expect(res.deprecation.sunset).toBe(true);
  });

  it('falls back to a newer version when fallback=latest', async () => {
    const fallback = new VersionedRouterEngine({
      strategy: 'path',
      defaultVersion: 'v1',
      fallback: 'latest',
      now: () => 0,
    });
    fallback.addRoute(vroute('v1', HttpMethod.GET, '/a', { handler: async () => ({ status: 200, body: 'v1a' }) }));
    fallback.addRoute(vroute('v2', HttpMethod.GET, '/b', { handler: async () => ({ status: 200, body: 'v2b' }) }));

    // v1 request for /b — not in v1 — falls back to v2.
    const res = await fallback.dispatch(HttpMethod.GET, '/v1/b');
    expect(res.status).toBe(200);
    expect(res.body).toBe('v2b');
    expect(res.servedByVersion).toBe('v2');
  });

  it('counts per-version hits', async () => {
    engine.addRoute(vroute('v1', HttpMethod.GET, '/a'));
    engine.addRoute(vroute('v2', HttpMethod.GET, '/a'));
    await engine.dispatch(HttpMethod.GET, '/v1/a');
    await engine.dispatch(HttpMethod.GET, '/v1/a');
    await engine.dispatch(HttpMethod.GET, '/v2/a');
    expect(engine.versionHits('v1')).toBe(2);
    expect(engine.versionHits('v2')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Route constraints
// ---------------------------------------------------------------------------

describe('ConstrainedRouterEngine', () => {
  let router: ConstrainedRouterEngine;

  beforeEach(() => {
    router = new ConstrainedRouterEngine();
  });

  it('matches params satisfying a regex constraint', async () => {
    router.addRoute({
      method: HttpMethod.GET,
      path: '/users/:id',
      constraints: { id: '\\d+' },
      handler: async (req) => ({ status: 200, body: `user-${req.params.id}` }),
    });
    const res = await router.dispatch(HttpMethod.GET, '/users/42');
    expect(res.status).toBe(200);
    expect(res.body).toBe('user-42');
  });

  it('rejects params that violate the constraint', async () => {
    router.addRoute({
      method: HttpMethod.GET,
      path: '/users/:id',
      constraints: { id: '\\d+' },
      handler: ok,
    });
    const res = await router.dispatch(HttpMethod.GET, '/users/abc');
    expect(res.status).toBe(404);
  });

  it('prefers constrained params over free params, falls through on violation', async () => {
    router.addRoute({
      method: HttpMethod.GET,
      path: '/items/:id',
      handler: async () => ({ status: 200, body: 'free' }),
    });
    router.addRoute({
      method: HttpMethod.GET,
      path: '/items/:id<int>',
      handler: async () => ({ status: 200, body: 'constrained' }),
    });

    const digits = await router.dispatch(HttpMethod.GET, '/items/7');
    expect(digits.body).toBe('constrained');

    const alpha = await router.dispatch(HttpMethod.GET, '/items/abc');
    expect(alpha.body).toBe('free');
  });

  it('falls through to a free param when constraint fails', async () => {
    router.addRoute({
      method: HttpMethod.GET,
      path: '/files/:name',
      constraints: { name: '\\.(png|jpe?g)$' },
      handler: async () => ({ status: 200, body: 'image' }),
    });
    const res = await router.dispatch(HttpMethod.GET, '/files/doc.txt');
    expect(res.status).toBe(404);
  });

  it('uses builtin constraint shorthands', async () => {
    router.addRoute({
      method: HttpMethod.GET,
      path: '/posts/:slug<slug>',
      handler: async () => ({ status: 200, body: 'post' }),
    });
    expect((await router.dispatch(HttpMethod.GET, '/posts/hello-world')).status).toBe(200);
    expect((await router.dispatch(HttpMethod.GET, '/posts/Bad Slug')).status).toBe(404);
  });

  it('matches literal hosts', async () => {
    router.addRoute({
      method: HttpMethod.GET,
      path: '/dashboard',
      host: 'admin.internal',
      handler: async () => ({ status: 200, body: 'admin' }),
    });
    const res = await router.dispatch(HttpMethod.GET, '/dashboard', 'admin.internal');
    expect(res.status).toBe(200);
    expect(res.body).toBe('admin');
  });

  it('rejects non-matching hosts', async () => {
    router.addRoute({
      method: HttpMethod.GET,
      path: '/dashboard',
      host: 'admin.internal',
      handler: ok,
    });
    const res = await router.dispatch(HttpMethod.GET, '/dashboard', 'www.public.com');
    expect(res.status).toBe(404);
  });

  it('captures host variables', async () => {
    router.addRoute({
      method: HttpMethod.GET,
      path: '/t/:id',
      host: '{tenant}.app.example.com',
      handler: async (req) => ({ status: 200, body: req.params.id }),
    });
    const res = await router.dispatch(HttpMethod.GET, '/t/9', 'acme.app.example.com');
    expect(res.status).toBe(200);
    expect(res.hostVars?.tenant).toBe('acme');
  });
});

// ---------------------------------------------------------------------------
// Host pattern compiler + matcher
// ---------------------------------------------------------------------------

describe('compileHostPattern / matchHost', () => {
  it('compiles literal-only patterns', () => {
    const p = compileHostPattern('admin.internal');
    expect(p.specificity).toBeGreaterThan(0);
    const m = matchHost(p, 'admin.internal');
    expect(m?.matched).toBe(true);
  });

  it('captures subdomain variables', () => {
    const p = compileHostPattern('{tenant}.api.example.com');
    const m = matchHost(p, 'acme.api.example.com');
    expect(m?.matched).toBe(true);
    expect(m?.variables.tenant).toBe('acme');
  });

  it('captures multi-level subdomains in one variable', () => {
    const p = compileHostPattern('{sub}.example.com');
    const m = matchHost(p, 'a.b.example.com');
    expect(m?.matched).toBe(true);
    expect(m?.variables.sub).toBe('a.b');
  });

  it('rejects hosts missing a literal suffix', () => {
    const p = compileHostPattern('{tenant}.api.example.com');
    expect(matchHost(p, 'acme.api.other.com')).toBeNull();
    expect(matchHost(p, 'api.example.com')).toBeNull();
  });

  it('is case-insensitive', () => {
    const p = compileHostPattern('{T}.Example.COM');
    const m = matchHost(p, 'X.EXAMPLE.com');
    expect(m?.matched).toBe(true);
    expect(m?.variables.T).toBe('x');
  });
});

// ---------------------------------------------------------------------------
// Subdomain router
// ---------------------------------------------------------------------------

describe('SubdomainRouter', () => {
  let router: SubdomainRouter;

  beforeEach(() => {
    router = new SubdomainRouter();
  });

  it('dispatches to a tenant bucket by subdomain', async () => {
    router.addRoute('{tenant}.app.test', {
      method: HttpMethod.GET,
      path: '/whoami',
      handler: async () => ({ status: 200, body: 'tenant-route' }),
    });
    const res = await router.dispatch(HttpMethod.GET, '/whoami', 'acme.app.test');
    expect(res.status).toBe(200);
    expect(res.body).toBe('tenant-route');
    expect(res.hostVars?.tenant).toBe('acme');
    expect(res.matchedHostPattern).toBe('{tenant}.app.test');
  });

  it('routes literal subdomains before variables', async () => {
    router.addRoute('{sub}.api.test', {
      method: HttpMethod.GET,
      path: '/x',
      handler: async () => ({ status: 200, body: 'generic' }),
    });
    router.addRoute('admin.api.test', {
      method: HttpMethod.GET,
      path: '/x',
      handler: async () => ({ status: 200, body: 'admin' }),
    });
    const res = await router.dispatch(HttpMethod.GET, '/x', 'admin.api.test');
    expect(res.body).toBe('admin');
  });

  it('404s when no bucket matches', async () => {
    router.addRoute('a.test', {
      method: HttpMethod.GET,
      path: '/x',
      handler: ok,
    });
    const res = await router.dispatch(HttpMethod.GET, '/x', 'other.test');
    expect(res.status).toBe(404);
  });

  it('strips ports before matching', async () => {
    const r = new SubdomainRouter();
    r.addRoute('api.test', {
      method: HttpMethod.GET,
      path: '/p',
      handler: ok,
    });
    const res = await r.dispatch(HttpMethod.GET, '/p', 'api.test:8080');
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Route metrics
// ---------------------------------------------------------------------------

describe('RouteMetricsCollector', () => {
  let metrics: RouteMetricsCollector;

  beforeEach(() => {
    metrics = new RouteMetricsCollector({ reservoirSize: 16, now: () => 1000 });
  });

  it('aggregates hits and computes avg latency', () => {
    metrics.record(HttpMethod.GET, '/users/:id', 200, 10);
    metrics.record(HttpMethod.GET, '/users/:id', 200, 20);
    metrics.record(HttpMethod.GET, '/users/:id', 200, 30);
    const m = metrics.metricsFor(HttpMethod.GET, '/users/:id');
    expect(m?.hits).toBe(3);
    expect(m?.latencyMs.avg).toBeCloseTo(20, 5);
    expect(m?.latencyMs.min).toBe(10);
    expect(m?.latencyMs.max).toBe(30);
  });

  it('counts 4xx vs 5xx separately', () => {
    metrics.record(HttpMethod.GET, '/x', 200, 5);
    metrics.record(HttpMethod.GET, '/x', 404, 5);
    metrics.record(HttpMethod.GET, '/x', 500, 5);
    const m = metrics.metricsFor(HttpMethod.GET, '/x');
    expect(m?.hits).toBe(3);
    expect(m?.errors).toBe(1);
    expect(m?.clientErrors).toBe(1);
    expect(m?.successes).toBe(1);
  });

  it('computes percentiles over the reservoir', () => {
    for (const ms of [1, 2, 3, 4, 5, 6, 7, 8, 9, 100]) {
      metrics.record(HttpMethod.GET, '/p', 200, ms);
    }
    const m = metrics.metricsFor(HttpMethod.GET, '/p');
    expect(m?.percentiles.p50).toBe(5);
    expect(m?.percentiles.p90).toBe(9);
    expect(m?.percentiles.p99).toBe(100);
  });

  it('ring buffer wraps at capacity', () => {
    const small = new RouteMetricsCollector({ reservoirSize: 4 });
    for (const ms of [1, 2, 3, 4, 5, 6]) {
      small.record(HttpMethod.GET, '/r', 200, ms);
    }
    const m = small.metricsFor(HttpMethod.GET, '/r');
    // Only the last 4 samples should remain in the reservoir window.
    expect(m?.percentiles.p50).toBe(4);
    expect(m?.percentiles.p99).toBe(6);
  });

  it('snapshot rolls up top routes by hits', () => {
    for (let i = 0; i < 10; i++) {
      metrics.record(HttpMethod.GET, `/r${i}`, 200, 1);
    }
    for (let i = 0; i < 5; i++) {
      metrics.record(HttpMethod.GET, '/hot', 200, 1);
    }
    const snap = metrics.snapshot();
    expect(snap.totalRequests).toBe(15);
    expect(snap.topRoutes[0].key).toBe('GET /hot');
    expect(snap.topRoutes[0].hits).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Hot-swap router
// ---------------------------------------------------------------------------

describe('HotSwapRouter', () => {
  let hot: HotSwapRouter;

  beforeEach(() => {
    hot = new HotSwapRouter(undefined, { now: () => 0 });
  });

  it('publishes staged routes atomically on swap', async () => {
    hot.stage();
    const t = hot.stage();
    t.addRoute(route(HttpMethod.GET, '/v2', 'v2'));
    const rec = hot.swap('deploy-1');
    expect(rec.routeCount).toBe(1);
    expect(hot.routeCount).toBe(1);
    const res = await hot.dispatch(HttpMethod.GET, '/v2');
    expect(res.status).toBe(200);
    expect(res.body).toBe('v2');
  });

  it('old table stays visible until swap', async () => {
    const t = hot.stage();
    t.addRoute(route(HttpMethod.GET, '/v1', 'v1'));
    hot.swap();
    const before = hot.match(HttpMethod.GET, '/v1');
    expect(before.kind).toBe('matched');

    // Stage a generation that removes /v1.
    const next = hot.stage();
    next.addRoute(route(HttpMethod.GET, '/v2', 'v2'));
    // Before swap, /v1 still resolves.
    expect(hot.match(HttpMethod.GET, '/v1').kind).toBe('matched');
    hot.swap();
    expect(hot.match(HttpMethod.GET, '/v1').kind).toBe('not_found');
    expect(hot.match(HttpMethod.GET, '/v2').kind).toBe('matched');
  });

  it('swap without stage throws', () => {
    expect(() => hot.swap()).toThrow();
  });

  it('discardPending drops the staged table', () => {
    const t = hot.stage();
    t.addRoute(route(HttpMethod.GET, '/x'));
    hot.discardPending();
    expect(hot.hasPending).toBe(false);
    expect(hot.match(HttpMethod.GET, '/x').kind).toBe('not_found');
  });

  it('rollback aborts a pending stage', () => {
    const t = hot.stage();
    t.addRoute(route(HttpMethod.GET, '/x'));
    expect(hot.rollback()).toBe(true);
    expect(hot.hasPending).toBe(false);
    expect(hot.rollback()).toBe(false);
  });

  it('keeps bounded swap history', () => {
    const h = new HotSwapRouter(undefined, { historySize: 3 });
    for (let i = 0; i < 5; i++) {
      const t = h.stage();
      t.addRoute(route(HttpMethod.GET, `/v${i}`));
      h.swap(`deploy-${i}`);
    }
    const hist = h.history();
    expect(hist.length).toBe(3);
    expect(hist[hist.length - 1].label).toBe('deploy-4');
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

describe('parseConstrainedPattern', () => {
  it('rewrites :name<regex> to :name and extracts the constraint', () => {
    const { path, constraints } = parseConstrainedPattern('/files/:name<\\.(png|jpg)$>');
    expect(path).toBe('/files/:name');
    expect(constraints.length).toBe(1);
    expect(constraints[0].name).toBe('name');
    expect(constraints[0].raw).toBe('\\.(png|jpg)$');
  });

  it('resolves builtin shorthand constraints', () => {
    const { constraints } = parseConstrainedPattern('/users/:id<int>');
    expect(constraints[0].regex.test('42')).toBe(true);
    expect(constraints[0].regex.test('x')).toBe(false);
  });

  it('leaves constraint-free patterns untouched', () => {
    const { path, constraints } = parseConstrainedPattern('/plain/:p/*rest');
    expect(path).toBe('/plain/:p/*rest');
    expect(constraints.length).toBe(0);
  });
});

describe('stageRoutes helper', () => {
  it('stages a list of routes in one call', () => {
    const hot = new HotSwapRouter();
    const t = stageRoutes(hot, [route(HttpMethod.GET, '/a'), route(HttpMethod.GET, '/b')]);
    expect(t.routeCount).toBe(2);
    hot.swap();
    expect(hot.routeCount).toBe(2);
  });
});
