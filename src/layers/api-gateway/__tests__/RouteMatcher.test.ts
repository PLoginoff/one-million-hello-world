/**
 * RouteMatcher unit tests
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  RouteMatcher,
  compareVersions,
  extractRequestVersion,
  versionSatisfies,
} from '../engine/RouteMatcher';
import type { GatewayRoute } from '../engine/types';
import type { RandomSource } from '../engine/types';

class FixedRandom implements RandomSource {
  constructor(private value: number) {}
  next(): number {
    return this.value;
  }
}

function route(partial: Partial<GatewayRoute> & Pick<GatewayRoute, 'id' | 'pathPattern'>): GatewayRoute {
  return {
    methods: [],
    upstreams: [{ name: 'up1', baseUrl: 'http://a' }],
    ...partial,
  };
}

const NO_HEADERS: Record<string, string[]> = {};

describe('RouteMatcher', () => {
  let matcher: RouteMatcher;

  beforeEach(() => {
    matcher = new RouteMatcher();
  });

  it('matches a literal route', () => {
    matcher.register(route({ id: 'r1', pathPattern: '/api/users' }));
    const m = matcher.match({ method: 'GET', path: '/api/users', headers: NO_HEADERS, query: {} });
    expect(m?.route.id).toBe('r1');
  });

  it('extracts path params', () => {
    matcher.register(route({ id: 'r2', pathPattern: '/api/users/:id/orders/{orderId}' }));
    const m = matcher.match({
      method: 'GET',
      path: '/api/users/42/orders/abc',
      headers: NO_HEADERS,
      query: {},
    });
    expect(m?.params).toEqual({ id: '42', orderId: 'abc' });
  });

  it('matches trailing wildcard with zero or more segments', () => {
    matcher.register(route({ id: 'w', pathPattern: '/static/*' }));
    expect(matcher.match({ method: 'GET', path: '/static', headers: NO_HEADERS, query: {} })?.route.id).toBe('w');
    expect(matcher.match({ method: 'GET', path: '/static/a/b/c', headers: NO_HEADERS, query: {} })?.route.id).toBe('w');
  });

  it('prefers more specific (literal) routes over param routes', () => {
    matcher.register(route({ id: 'param', pathPattern: '/api/users/:id' }));
    matcher.register(route({ id: 'lit', pathPattern: '/api/users/me' }));
    const m = matcher.match({ method: 'GET', path: '/api/users/me', headers: NO_HEADERS, query: {} });
    expect(m?.route.id).toBe('lit');
  });

  it('honors explicit priority as a tie-breaker', () => {
    matcher.register(route({ id: 'low', pathPattern: '/x/:a', priority: 1 }));
    matcher.register(route({ id: 'high', pathPattern: '/x/:b', priority: 5 }));
    const m = matcher.match({ method: 'GET', path: '/x/v', headers: NO_HEADERS, query: {} });
    expect(m?.route.id).toBe('high');
  });

  it('filters by method', () => {
    matcher.register(route({ id: 'get', pathPattern: '/m', methods: ['GET'] }));
    matcher.register(route({ id: 'post', pathPattern: '/m', methods: ['POST'] }));
    expect(matcher.match({ method: 'POST', path: '/m', headers: NO_HEADERS, query: {} })?.route.id).toBe('post');
    expect(matcher.match({ method: 'DELETE', path: '/m', headers: NO_HEADERS, query: {} })).toBeUndefined();
  });

  it('unregisters routes', () => {
    matcher.register(route({ id: 'r', pathPattern: '/gone' }));
    expect(matcher.unregister('r')).toBe(true);
    expect(matcher.match({ method: 'GET', path: '/gone', headers: NO_HEADERS, query: {} })).toBeUndefined();
    expect(matcher.unregister('r')).toBe(false);
  });

  describe('version constraints', () => {
    beforeEach(() => {
      matcher.register(
        route({
          id: 'v1',
          pathPattern: '/res',
          version: { min: '1.0.0', max: '1.9.9' },
        })
      );
      matcher.register(
        route({
          id: 'v2',
          pathPattern: '/res',
          version: { min: '2.0.0' },
          priority: 1,
        })
      );
    });

    it('matches the version range given by x-api-version', () => {
      const m = matcher.match({
        method: 'GET',
        path: '/res',
        headers: { 'x-api-version': ['1.5.0'] },
        query: {},
      });
      expect(m?.route.id).toBe('v1');
      expect(m?.apiVersion).toBe('1.5.0');
    });

    it('rejects a request whose version satisfies no route', () => {
      const m = matcher.match({
        method: 'GET',
        path: '/res',
        headers: { 'x-api-version': ['0.9'] },
        query: {},
      });
      expect(m).toBeUndefined();
    });

    it('extracts version from Accept header', () => {
      const m = matcher.match({
        method: 'GET',
        path: '/res',
        headers: { accept: ['application/json; version=2.1'] },
        query: {},
      });
      expect(m?.route.id).toBe('v2');
    });

    it('extracts version from query string', () => {
      const m = matcher.match({
        method: 'GET',
        path: '/res',
        headers: NO_HEADERS,
        query: { version: '2.0' },
      });
      expect(m?.route.id).toBe('v2');
    });
  });

  describe('compareVersions', () => {
    it('orders numeric segments', () => {
      expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
      expect(compareVersions('1.0', '1.0.0')).toBe(0);
      expect(compareVersions('2.0', '1.9.9')).toBeGreaterThan(0);
    });
  });

  describe('versionSatisfies', () => {
    it('honors exact, min, max, default and required', () => {
      expect(versionSatisfies('1.2', { exact: '1.2' })).toBe(true);
      expect(versionSatisfies('1.3', { exact: '1.2' })).toBe(false);
      expect(versionSatisfies(undefined, { required: true })).toBe(false);
      expect(versionSatisfies(undefined, { default: '1.0', min: '1.0' })).toBe(true);
      expect(versionSatisfies(undefined, {})).toBe(true);
    });
  });

  describe('upstream selection and canary', () => {
    it('picks a single upstream directly', () => {
      matcher.register(route({ id: 's', pathPattern: '/s' }));
      const m = matcher.match({ method: 'GET', path: '/s', headers: NO_HEADERS, query: {} });
      expect(m?.upstream.name).toBe('up1');
    });

    it('routes the canary group to canary upstream', () => {
      matcher.setCanaryRules({ group: 'beta' });
      matcher.register(
        route({
          id: 'c',
          pathPattern: '/c',
          upstreams: [
            { name: 'stable', baseUrl: 'http://a' },
            { name: 'canary', baseUrl: 'http://b', canary: true },
          ],
        })
      );
      const beta = matcher.match({
        method: 'GET',
        path: '/c',
        headers: NO_HEADERS,
        query: {},
        consumerGroup: 'beta',
      });
      expect(beta?.upstream.name).toBe('canary');
      const normal = matcher.match({
        method: 'GET',
        path: '/c',
        headers: NO_HEADERS,
        query: {},
        consumerGroup: 'ga',
      });
      expect(normal?.upstream.name).toBe('stable');
    });

    it('sends a percentage of traffic to canary deterministically', () => {
      const rand = new FixedRandom(0.05); // 5% < 10%
      const m2 = new RouteMatcher(rand);
      m2.setCanaryRules({ weightPercent: 10 });
      m2.register(
        route({
          id: 'c',
          pathPattern: '/c',
          upstreams: [
            { name: 'stable', baseUrl: 'http://a' },
            { name: 'canary', baseUrl: 'http://b', canary: true },
          ],
        })
      );
      const got = m2.match({ method: 'GET', path: '/c', headers: NO_HEADERS, query: {} });
      expect(got?.upstream.name).toBe('canary');
    });

    it('forces canary via header', () => {
      matcher.setCanaryRules({ header: 'x-env', headerValue: 'canary' });
      matcher.register(
        route({
          id: 'c',
          pathPattern: '/c',
          upstreams: [
            { name: 'stable', baseUrl: 'http://a' },
            { name: 'canary', baseUrl: 'http://b', canary: true },
          ],
        })
      );
      const m = matcher.match({
        method: 'GET',
        path: '/c',
        headers: { 'x-env': ['canary'] },
        query: {},
      });
      expect(m?.upstream.name).toBe('canary');
    });

    it('does weighted load balancing across stable upstreams', () => {
      const rand = new FixedRandom(0.9);
      const m2 = new RouteMatcher(rand);
      m2.register(
        route({
          id: 'w',
          pathPattern: '/w',
          upstreams: [
            { name: 'a', baseUrl: 'http://a', weight: 1 },
            { name: 'b', baseUrl: 'http://b', weight: 9 },
          ],
        })
      );
      // roll = 0.9 * 10 = 9 -> falls in b's range
      const got = m2.match({ method: 'GET', path: '/w', headers: NO_HEADERS, query: {} });
      expect(got?.upstream.name).toBe('b');
    });
  });
});

describe('extractRequestVersion', () => {
  it('prefers the dedicated header, then Accept, then query, then path', () => {
    expect(
      extractRequestVersion({ 'x-api-version': ['3'] }, { version: '2' }, '/v1/x', undefined)
    ).toBe('3');
    expect(
      extractRequestVersion({ accept: ['text/json;version=4'] }, { version: '2' }, '/v1/x', undefined)
    ).toBe('4');
    expect(extractRequestVersion({}, { version: '2' }, '/v1/x', undefined)).toBe('2');
    expect(extractRequestVersion({}, {}, '/v1/x', undefined)).toBe('1');
    expect(extractRequestVersion({}, {}, '/x/y', undefined)).toBeUndefined();
  });
});
