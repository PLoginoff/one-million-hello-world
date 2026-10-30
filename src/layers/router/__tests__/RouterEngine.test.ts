/**
 * Router Engine Tests
 *
 * Covers: radix trie construction (compressed edges), param + wildcard
 * matching, specificity ordering, route conflict detection, LRU
 * resolution caching, route groups, per-route middleware pipelines,
 * and 405 detection with allowed-method listing.
 */

import { describe, it, expect, beforeEach } from 'bun:test';

import { HttpMethod } from '../types/router-types';
import {
  RadixTrieRouter,
  RouterEngine,
  RouteCache,
  RouteConflictError,
  tokenizePattern,
  RouteResult,
} from '../engine';

const ok = async (): Promise<RouteResult> => ({ status: 200, body: 'ok' });

function route(method: HttpMethod, path: string, body: string = path) {
  return {
    method,
    path,
    handler: async (): Promise<RouteResult> => ({ status: 200, body }),
  };
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

describe('tokenizePattern', () => {
  it('splits patterns into static / param / wildcard tokens', () => {
    expect(tokenizePattern('/users/:id/files/*rest')).toEqual([
      { kind: 'static', text: '/users/' },
      { kind: 'param', name: 'id' },
      { kind: 'static', text: '/files/' },
      { kind: 'wildcard', name: 'rest' },
    ]);
  });

  it('treats * without a name as a generic wildcard', () => {
    const tokens = tokenizePattern('/static/*');
    expect(tokens[1]).toEqual({ kind: 'wildcard', name: 'wildcard' });
  });

  it('rejects non-absolute patterns', () => {
    expect(() => tokenizePattern('users')).toThrow();
  });

  it('rejects empty param names and mid-pattern wildcards', () => {
    expect(() => tokenizePattern('/a/:')).toThrow();
    expect(() => tokenizePattern('/a/*/b')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Trie matching
// ---------------------------------------------------------------------------

describe('RadixTrieRouter matching', () => {
  let router: RadixTrieRouter;

  beforeEach(() => {
    router = new RadixTrieRouter();
  });

  it('matches exact static paths', () => {
    router.addRoute(route(HttpMethod.GET, '/health'));
    const result = router.match(HttpMethod.GET, '/health');
    expect(result.kind).toBe('matched');
  });

  it('returns not_found for unregistered paths', () => {
    router.addRoute(route(HttpMethod.GET, '/health'));
    expect(router.match(HttpMethod.GET, '/nope').kind).toBe('not_found');
  });

  it('captures parametric segments', () => {
    router.addRoute(route(HttpMethod.GET, '/users/:id'));
    const result = router.match(HttpMethod.GET, '/users/42');
    expect(result.kind).toBe('matched');
    if (result.kind === 'matched') {
      expect(result.match.request.params.id).toBe('42');
      expect(result.match.request.matchedPattern).toBe('/users/:id');
    }
  });

  it('captures multi-segment wildcards', () => {
    router.addRoute(route(HttpMethod.GET, '/files/*path'));
    const result = router.match(HttpMethod.GET, '/files/a/b/c.txt');
    expect(result.kind).toBe('matched');
    if (result.kind === 'matched') {
      expect(result.match.request.wildcard).toBe('a/b/c.txt');
    }
  });

  it('prefers static routes over params (specificity)', () => {
    router.addRoute(route(HttpMethod.GET, '/users/:id', 'param'));
    router.addRoute(route(HttpMethod.GET, '/users/me', 'static'));

    const result = router.match(HttpMethod.GET, '/users/me');
    expect(result.kind).toBe('matched');
    if (result.kind === 'matched') {
      expect(result.match.request.matchedPattern).toBe('/users/me');
      expect(result.match.specificity).toBeGreaterThan(0);
    }
  });

  it('prefers params over wildcards', () => {
    router.addRoute(route(HttpMethod.GET, '/assets/*rest', 'wild'));
    router.addRoute(route(HttpMethod.GET, '/assets/:name', 'param'));

    const result = router.match(HttpMethod.GET, '/assets/logo.png');
    expect(result.kind).toBe('matched');
    if (result.kind === 'matched') {
      expect(result.match.request.matchedPattern).toBe('/assets/:name');
    }
  });

  it('still matches wildcard when param does not complete the path', () => {
    router.addRoute(route(HttpMethod.GET, '/assets/:name', 'param'));
    router.addRoute(route(HttpMethod.GET, '/assets/*rest', 'wild'));

    const result = router.match(HttpMethod.GET, '/assets/css/app/main.css');
    expect(result.kind).toBe('matched');
    if (result.kind === 'matched') {
      expect(result.match.request.matchedPattern).toBe('/assets/*rest');
    }
  });

  it('splits compressed edges on shared prefixes', () => {
    router.addRoute(route(HttpMethod.GET, '/api/v1/users', 'v1u'));
    router.addRoute(route(HttpMethod.GET, '/api/v1/posts', 'v1p'));
    router.addRoute(route(HttpMethod.GET, '/api/v2/users', 'v2u'));

    expect(router.match(HttpMethod.GET, '/api/v1/posts').kind).toBe('matched');
    expect(router.match(HttpMethod.GET, '/api/v2/users').kind).toBe('matched');
    // Compression: shared "/api/v" prefix collapses into fewer nodes.
    expect(router.nodeCount()).toBeLessThan(12);
  });

  it('detects route conflicts', () => {
    router.addRoute(route(HttpMethod.GET, '/dup'));
    expect(() => router.addRoute(route(HttpMethod.GET, '/dup'))).toThrow(RouteConflictError);
    // Different methods on same pattern are fine.
    router.addRoute(route(HttpMethod.POST, '/dup'));
  });

  it('removes routes', () => {
    router.addRoute(route(HttpMethod.GET, '/gone'));
    expect(router.removeRoute(HttpMethod.GET, '/gone')).toBe(true);
    expect(router.match(HttpMethod.GET, '/gone').kind).toBe('not_found');
    expect(router.removeRoute(HttpMethod.GET, '/gone')).toBe(false);
  });

  it('reports method_not_allowed with allowed methods', () => {
    router.addRoute(route(HttpMethod.GET, '/items'));
    router.addRoute(route(HttpMethod.POST, '/items'));
    router.addRoute(route(HttpMethod.DELETE, '/items'));

    const result = router.match(HttpMethod.PUT, '/items');
    expect(result.kind).toBe('method_not_allowed');
    if (result.kind === 'method_not_allowed') {
      expect([...result.allowedMethods].sort()).toEqual([
        HttpMethod.DELETE,
        HttpMethod.GET,
        HttpMethod.POST,
      ]);
      expect(result.closestPattern).toBe('/items');
    }
  });

  it('distinguishes 404 vs 405 when path is unregistered entirely', () => {
    router.addRoute(route(HttpMethod.GET, '/x'));
    expect(router.match(HttpMethod.DELETE, '/y').kind).toBe('not_found');
  });
});

// ---------------------------------------------------------------------------
// Dispatch + middleware
// ---------------------------------------------------------------------------

describe('route dispatch + middleware', () => {
  it('runs route-local middleware around the handler', async () => {
    const engine = new RouterEngine();
    const order: string[] = [];

    engine.addRoute({
      method: HttpMethod.GET,
      path: '/thing/:id',
      middleware: [
        async (req, next) => {
          order.push('mw-before');
          const res = await next();
          order.push('mw-after');
          return res;
        },
      ],
      handler: async (req) => {
        order.push('handler');
        return { status: 200, body: req.params.id };
      },
    });

    const res = await engine.dispatch(HttpMethod.GET, '/thing/7');
    expect(order).toEqual(['mw-before', 'handler', 'mw-after']);
    expect(res.body).toBe('7');
    expect(res.matchedPattern).toBe('/thing/:id');
  });

  it('middleware can short-circuit', async () => {
    const engine = new RouterEngine();
    engine.addRoute({
      method: HttpMethod.GET,
      path: '/guarded',
      middleware: [async () => ({ status: 403, body: 'denied' })],
      handler: ok,
    });

    const res = await engine.dispatch(HttpMethod.GET, '/guarded');
    expect(res.status).toBe(403);
  });

  it('returns a structured 405 with allow header', async () => {
    const engine = new RouterEngine();
    engine.addRoute(route(HttpMethod.GET, '/res'));
    engine.addRoute(route(HttpMethod.POST, '/res'));

    const res = await engine.dispatch(HttpMethod.DELETE, '/res');
    expect(res.status).toBe(405);
    expect(res.headers?.allow).toContain(HttpMethod.GET);
    expect(res.headers?.allow).toContain(HttpMethod.POST);
  });
});

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

describe('route groups', () => {
  it('applies shared prefix and middleware', async () => {
    const engine = new RouterEngine();
    const seen: string[] = [];

    const groupMw = async (req: Parameters<Parameters<typeof engine.addRoute>[0]['handler']>[0], next: () => Promise<RouteResult>) => {
      seen.push('group-mw');
      return next();
    };

    engine.group({
      name: 'api',
      prefix: '/api/v1',
      middleware: [groupMw],
      routes: [route(HttpMethod.GET, '/users/:id', 'user'), route(HttpMethod.GET, '/health', 'health')],
    });

    const res = await engine.dispatch(HttpMethod.GET, '/api/v1/users/9');
    expect(res.status).toBe(200);
    expect(res.body).toBe('user');
    expect(seen).toEqual(['group-mw']);
  });

  it('group middleware runs before route middleware', async () => {
    const engine = new RouterEngine();
    const order: string[] = [];

    engine.group({
      prefix: '/g',
      middleware: [async (req, next) => {
        order.push('group');
        return next();
      }],
      routes: [
        {
          method: HttpMethod.GET,
          path: '/x',
          middleware: [async (req, next) => {
            order.push('route');
            return next();
          }],
          handler: ok,
        },
      ],
    });

    await engine.dispatch(HttpMethod.GET, '/g/x');
    expect(order).toEqual(['group', 'route']);
  });

  it('removes all group routes via removeGroup', async () => {
    const engine = new RouterEngine();
    engine.group({
      name: 'v1',
      prefix: '/v1',
      routes: [route(HttpMethod.GET, '/a'), route(HttpMethod.GET, '/b')],
    });

    expect(engine.routeCount).toBe(2);
    expect(engine.removeGroup('v1')).toBe(true);
    expect(engine.routeCount).toBe(0);
    expect(engine.match(HttpMethod.GET, '/v1/a').kind).toBe('not_found');
  });
});

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

describe('RouteCache', () => {
  it('serves repeated lookups from cache', () => {
    const cache = new RouteCache({ capacity: 4 });
    const engine = new RouterEngine({ cacheCapacity: 4 });
    void cache;

    engine.addRoute(route(HttpMethod.GET, '/hot'));
    engine.match(HttpMethod.GET, '/hot');
    engine.match(HttpMethod.GET, '/hot');
    engine.match(HttpMethod.GET, '/hot');

    const stats = engine.cacheStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(engine.cacheHitRate()).toBeCloseTo(2 / 3, 5);
  });

  it('evicts least-recently-used at capacity', () => {
    const cache = new RouteCache({ capacity: 2 });
    const r404 = { kind: 'not_found' } as const;

    cache.store(HttpMethod.GET, '/a', r404);
    cache.store(HttpMethod.GET, '/b', r404);
    cache.lookup(HttpMethod.GET, '/a'); // promote /a
    cache.store(HttpMethod.GET, '/c', r404); // evicts /b

    expect(cache.lookup(HttpMethod.GET, '/a')).toBeDefined();
    expect(cache.lookup(HttpMethod.GET, '/b')).toBeUndefined();
    expect(cache.stats().evictions).toBe(1);
  });

  it('invalidates on registration', () => {
    const engine = new RouterEngine({ cacheCapacity: 8 });
    engine.addRoute(route(HttpMethod.GET, '/x'));

    engine.match(HttpMethod.GET, '/x');
    expect(engine.cacheStats().size).toBe(1);

    engine.addRoute(route(HttpMethod.GET, '/y'));
    expect(engine.cacheStats().size).toBe(0);
  });
});
