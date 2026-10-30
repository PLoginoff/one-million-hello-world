/**
 * ContractRegistry + ProviderVerifier engine tests.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  ContractBuilder,
  ContractRegistry,
  ProviderVerifier,
  parseSemver,
  formatSemver,
  compareSemver,
} from '../engine/ContractRegistry';
import type { ContractRequest, ContractResponse, Contract } from '../engine/ContractRegistry';

describe('semver', () => {
  it('parses and formats', () => {
    expect(parseSemver('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseSemver('2.0.0-rc.1').major).toBe(2);
    expect(formatSemver({ major: 1, minor: 0, patch: 0 })).toBe('1.0.0');
    expect(() => parseSemver('nope')).toThrow();
  });

  it('compares correctly', () => {
    expect(compareSemver(parseSemver('1.0.0'), parseSemver('1.0.1'))).toBe(-1);
    expect(compareSemver(parseSemver('2.0.0'), parseSemver('1.9.9'))).toBe(1);
    expect(compareSemver(parseSemver('1.2.3'), parseSemver('1.2.3'))).toBe(0);
  });
});

describe('ContractBuilder', () => {
  it('builds immutable contracts with auto ids', () => {
    const c = new ContractBuilder('web', 'api')
      .version('1.0.0')
      .interaction({
        description: 'get thing',
        request: { method: 'GET', path: '/things/1' },
        response: { status: 200, body: { id: 1 } },
      })
      .matchingRule({ path: '$.body.id', matcher: 'integer' })
      .build();
    expect(c.consumer).toBe('web');
    expect(c.interactions).toHaveLength(1);
    expect(c.interactions[0]?.id).toBe('interaction-1');
    expect(c.matchingRules).toHaveLength(1);
  });
});

describe('ContractRegistry', () => {
  let registry: ContractRegistry;
  let c1: Contract;
  let c2: Contract;

  beforeEach(() => {
    registry = new ContractRegistry();
    c1 = new ContractBuilder('web', 'api')
      .version('1.0.0')
      .interaction({
        description: 'a',
        request: { method: 'GET', path: '/a' },
        response: { status: 200 },
      })
      .build();
    c2 = new ContractBuilder('web', 'api')
      .version('1.1.0')
      .interaction({
        description: 'a',
        request: { method: 'GET', path: '/a' },
        response: { status: 200 },
      })
      .build();
  });

  it('publishes and fetches exact versions', () => {
    registry.publish(c1);
    registry.publish(c2);
    expect(registry.fetch('web', 'api', '1.0.0')?.version.minor).toBe(0);
    expect(registry.fetchLatest('web', 'api')?.version.minor).toBe(1);
    expect(registry.versions('web', 'api')).toHaveLength(2);
    expect(registry.fetch('web', 'api', '9.9.9')).toBeUndefined();
  });

  it('rejects duplicate publishes unless overwrite', () => {
    registry.publish(c1);
    expect(() => registry.publish(c1)).toThrow('already published');
    expect(() => registry.publish(c1, { overwrite: true })).not.toThrow();
  });

  it('tag-based discovery', () => {
    registry.publish(c1, { tags: ['prod'] });
    registry.publish(c2, { tags: ['dev'] });
    expect(registry.findByTag('prod').map((c) => formatSemver(c.version))).toEqual(['1.0.0']);
    expect(registry.findByTag('none')).toHaveLength(0);
  });

  it('forProvider aggregates across consumers', () => {
    const other = new ContractBuilder('mobile', 'api')
      .version('1.0.0')
      .interaction({
        description: 'b',
        request: { method: 'GET', path: '/b' },
        response: { status: 200 },
      })
      .build();
    registry.publish(c1);
    registry.publish(other);
    expect(registry.forProvider('api')).toHaveLength(2);
    expect(registry.pairs()).toHaveLength(2);
    expect(registry.publishedCount).toBe(2);
  });
});

describe('ProviderVerifier', () => {
  const contract = new ContractBuilder('web', 'api')
    .version('1.0.0')
    .interaction({
      id: 'i1',
      description: 'get user',
      providerState: 'user 42 exists',
      request: { method: 'GET', path: '/users/42' },
      response: {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: { id: 42, name: 'ann', email: 'a@b.co' },
      },
      matchingRules: [
        { path: '$.body.id', matcher: 'integer' },
        { path: '$.body.email', matcher: 'email' },
        { path: '$.body.name', matcher: 'type' },
      ],
    })
    .interaction({
      id: 'i2',
      description: 'list users',
      request: { method: 'GET', path: '/users' },
      response: { status: 200, body: [{ id: 1 }] },
      matchingRules: [
        { path: '$.body', matcher: 'eachLike', template: { id: 0 } },
        { path: '$.body[*].id', matcher: 'integer' },
      ],
    })
    .build();

  it('verifies a conforming provider', async () => {
    const handler = (req: ContractRequest): ContractResponse => {
      if (req.path === '/users/42') {
        return {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'X-Extra': 'allowed' },
          body: { id: 99, name: 'bob', email: 'bob@x.io' },
        };
      }
      return { status: 200, body: [{ id: 7 }, { id: 8 }] };
    };
    const verifier = new ProviderVerifier(handler);
    const report = await verifier.verify(contract);
    expect(report.success).toBe(true);
    expect(report.passed).toBe(2);
    expect(report.failed).toBe(0);
  });

  it('detects status, header and body mismatches with diffs', async () => {
    const handler = (): ContractResponse => ({
      status: 404,
      headers: { 'Content-Type': 'text/plain' },
      body: { id: 'oops', name: 123, email: 'not-an-email' },
    });
    const verifier = new ProviderVerifier(handler);
    const report = await verifier.verify(contract);
    expect(report.success).toBe(false);
    const r1 = report.results[0];
    expect(r1?.matched).toBe(false);
    const paths = r1?.mismatches.map((m) => m.path) ?? [];
    expect(paths).toContain('$.status');
    expect(paths).toContain('$.headers.Content-Type');
    expect(paths.some((p) => p.includes('email'))).toBe(true);
    expect(paths.some((p) => p.includes('id'))).toBe(true);
    expect(r1?.diff.length).toBeGreaterThan(0);
  });

  it('invokes provider state hooks', async () => {
    const states: string[] = [];
    const handler = (): ContractResponse => ({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { id: 1, name: 'x', email: 'e@e.co' },
    });
    const verifier = new ProviderVerifier(handler).onProviderState('user 42 exists', (s) => {
      states.push(s);
    });
    await verifier.verify(contract);
    expect(states).toEqual(['user 42 exists']);
  });

  it('supports async handlers', async () => {
    const verifier = new ProviderVerifier(async (req) => {
      await Promise.resolve();
      return req.path === '/users/42'
        ? { status: 200, headers: { 'Content-Type': 'application/json' }, body: { id: 5, name: 'n', email: 'n@n.co' } }
        : { status: 200, body: [{ id: 1 }] };
    });
    const report = await verifier.verify(contract);
    expect(report.success).toBe(true);
  });
});
