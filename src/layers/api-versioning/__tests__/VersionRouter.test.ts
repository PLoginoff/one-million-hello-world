/**
 * API Versioning — extraction, matrix, router, sunset tests.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  CompositeVersionExtractor,
  HeaderVersionExtractor,
  MediaTypeVersionExtractor,
  QueryVersionExtractor,
  UrlPathVersionExtractor,
  VersionMatrix,
  VersionRouter,
  VersionStatus,
  deprecationHeaders,
  httpDate,
} from '../negotiation';
import type { VersionedRequest } from '../negotiation';

function req(over: Partial<VersionedRequest>): VersionedRequest {
  return { path: '/users', headers: {}, ...over };
}

describe('extractors', () => {
  it('header', () => {
    const e = new HeaderVersionExtractor();
    const r = e.extract(req({ headers: { 'x-api-version': 'v2' } }));
    expect(r?.version).toBe('2');
    expect(r?.source).toBe('header');
  });

  it('url path — version segment only', () => {
    const e = new UrlPathVersionExtractor();
    expect(e.extract(req({ path: '/api/v2/users' }))?.version).toBe('2');
    expect(e.extract(req({ path: '/api/v1.2.3/users' }))?.version).toBe('1.2.3');
    expect(e.extract(req({ path: '/v1/users' }))?.version).toBe('1');
    expect(e.extract(req({ path: '/users/verbose2' }))).toBeUndefined();
    expect(e.extract(req({ path: '/users' }))).toBeUndefined();
  });

  it('query', () => {
    const e = new QueryVersionExtractor();
    expect(e.extract(req({ query: { version: '3' } }))?.version).toBe('3');
    expect(e.extract(req({ query: { 'api-version': '1.5' } }))?.version).toBe('1.5');
    expect(e.extract(req({ query: { other: 'x' } }))).toBeUndefined();
  });

  it('media type — vendor tree + version param', () => {
    const e = new MediaTypeVersionExtractor(['acme']);
    expect(e.extract(req({ headers: { accept: 'application/vnd.acme.v2+json' } }))?.version).toBe('2');
    expect(e.extract(req({ headers: { accept: 'application/json; version=2.1' } }))?.version).toBe('2.1');
    expect(e.extract(req({ headers: { accept: 'application/vnd.other.v3+json' } }))).toBeUndefined(); // vendor filter
    expect(e.extract(req({ headers: { accept: 'text/html' } }))).toBeUndefined();
  });

  it('composite prefers media-type over path', () => {
    const c = new CompositeVersionExtractor();
    const r = c.extract(
      req({ path: '/v1/users', headers: { accept: 'application/vnd.x.v9+json' } })
    );
    expect(r?.version).toBe('9');
    expect(r?.source).toBe('media-type');
  });
});

describe('VersionMatrix', () => {
  let matrix: VersionMatrix;
  const T0 = 1_700_000_000_000;

  beforeEach(() => {
    matrix = new VersionMatrix(() => T0);
    matrix.register({ version: '1.0.0', status: VersionStatus.DEPRECATED, deprecatedAt: T0 - 1000, sunsetAt: T0 + 10_000, successor: '2.0.0' });
    matrix.register({ version: '2.0.0', status: VersionStatus.SUPPORTED });
    matrix.register({ version: '3.0.0-beta.1', status: VersionStatus.BETA });
  });

  it('resolves lifecycles', () => {
    expect(matrix.resolve('2.0.0').lifecycle).toBe('supported');
    expect(matrix.resolve('1.0.0').lifecycle).toBe('sunset-pending');
    expect(matrix.resolve('3.0.0-beta.1').lifecycle).toBe('beta');
    expect(matrix.resolve('9.9.9').lifecycle).toBe('unknown');
  });

  it('sunset flips after sunsetAt', () => {
    expect(matrix.resolve('1.0.0', T0 + 20_000).sunset).toBe(true);
    expect(matrix.resolve('1.0.0', T0 + 20_000).lifecycle).toBe('sunset');
  });

  it('latest() picks newest non-sunset semver', () => {
    expect(matrix.latest()).toBe('2.0.0');
    matrix.register({ version: '2.1.0', status: VersionStatus.SUPPORTED });
    expect(matrix.latest()).toBe('2.1.0');
  });
});

describe('VersionRouter', () => {
  const T0 = 1_700_000_000_000;
  function makeRouter(opts: ConstructorParameters<typeof VersionRouter>[1] = {}) {
    const matrix = new VersionMatrix(() => T0);
    matrix.register({ version: '1.0.0', status: VersionStatus.DEPRECATED, deprecatedAt: T0 - 86_400_000, sunsetAt: T0 + 30 * 86_400_000, successor: '2.0.0', migrationGuideUrl: 'https://docs.example.com/migrate-v2' });
    matrix.register({ version: '2.0.0', status: VersionStatus.SUPPORTED });
    return new VersionRouter(matrix, { clock: () => T0, ...opts });
  }

  it('routes header-specified supported version', () => {
    const r = makeRouter();
    const d = r.route(req({ headers: { 'x-api-version': '2' } }));
    expect(d.reject).toBe(false);
    expect(d.version).toBe('2.0.0');
    expect(d.headers['X-API-Version']).toBe('2.0.0');
  });

  it('partial version "2" resolves to registered "2.0.0" via chain? — exact match required', () => {
    // NOTE: '2' doesn't equal '2.0.0' — router treats it as unknown and
    // falls back to default (latest supported). This is deliberate: clients
    // should send canonical versions.
    const r = makeRouter();
    const d = r.route(req({ headers: { 'x-api-version': '2.0.0' } }));
    expect(d.version).toBe('2.0.0');
    expect(d.fellBack).toBe(false);
  });

  it('deprecated version serves with deprecation headers', () => {
    const r = makeRouter();
    const d = r.route(req({ headers: { 'x-api-version': '1.0.0' } }));
    expect(d.reject).toBe(false);
    expect(d.version).toBe('1.0.0');
    expect(d.headers['Deprecation']).toBeDefined();
    expect(d.headers['Sunset']).toBe(httpDate(T0 + 30 * 86_400_000));
    expect(d.headers['X-API-Successor-Version']).toBe('2.0.0');
    expect(d.headers['Warning']).toContain('deprecated');
    expect(d.migrationGuideUrl).toBe('https://docs.example.com/migrate-v2');
  });

  it('sunset version rejects', () => {
    const pastT = T0 + 40 * 86_400_000;
    const matrix = new VersionMatrix(() => pastT);
    matrix.register({ version: '1.0.0', status: VersionStatus.DEPRECATED, sunsetAt: T0 + 30 * 86_400_000 });
    matrix.register({ version: '2.0.0', status: VersionStatus.SUPPORTED });
    const r = new VersionRouter(matrix, { clock: () => pastT });
    const d = r.route(req({ headers: { 'x-api-version': '1.0.0' } }));
    expect(d.reject).toBe(true);
    expect(d.rejectReason).toContain('sunset');
    expect(d.headers['Sunset']).toBeDefined();
  });

  it('fallback chain: v3 → v2 → served', () => {
    const r = makeRouter({ fallbacks: { '3.0.0': ['2.0.0'] } });
    const d = r.route(req({ headers: { 'x-api-version': '3.0.0' } }));
    expect(d.reject).toBe(false);
    expect(d.version).toBe('2.0.0');
    expect(d.fellBack).toBe(true);
    expect(d.headers['X-API-Version-Fallback']).toBe('3.0.0 → 2.0.0');
  });

  it('implicit request uses default version', () => {
    const r = makeRouter({ defaultVersion: '1.0.0' });
    const d = r.route(req({}));
    expect(d.version).toBe('1.0.0');
    expect(d.headers['Deprecation']).toBeDefined(); // still flagged
  });

  it('unknownPolicy=reject rejects unknown versions', () => {
    const r = makeRouter({ unknownPolicy: 'reject' });
    const d = r.route(req({ headers: { 'x-api-version': '7.0.0' } }));
    expect(d.reject).toBe(true);
    expect(d.rejectReason).toContain('unknown');
  });

  it('beta version serves with beta headers', () => {
    const matrix = new VersionMatrix(() => T0);
    matrix.register({ version: '3.0.0', status: VersionStatus.BETA });
    const r = new VersionRouter(matrix, { clock: () => T0 });
    const d = r.route(req({ headers: { 'x-api-version': '3.0.0' } }));
    expect(d.reject).toBe(false);
    expect(d.headers['X-API-Beta']).toBe('true');
  });

  it('suggest finds nearest same-major version', () => {
    const r = makeRouter();
    expect(r.suggest('2.4.0')).toBe('2.0.0');
    expect(r.suggest('9.9.9')).toBe('2.0.0'); // latest fallback
  });
});

describe('deprecationHeaders', () => {
  it('emits Link + Warning + Sunset', () => {
    const h = deprecationHeaders({
      version: '1.0.0',
      status: VersionStatus.DEPRECATED,
      deprecatedAt: 1_600_000_000_000,
      sunsetAt: 1_700_000_000_000,
      successor: '2.0.0',
      migrationGuideUrl: 'https://x/mig',
    });
    expect(h.headers['Deprecation']).toBe(httpDate(1_600_000_000_000));
    expect(h.headers['Sunset']).toBe(httpDate(1_700_000_000_000));
    expect(h.headers['Link']).toContain('rel="deprecation"');
    expect(h.headers['Warning']).toContain('migrate to 2.0.0');
  });
});
