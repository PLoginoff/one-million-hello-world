/**
 * ContractDsl tests — fluent authoring, inline matchers, HTTP adapter.
 */

import { describe, it, expect } from 'bun:test';
import {
  contractDsl,
  like,
  eachLike,
  regex,
  integer,
  bool,
  iso8601,
  arrayLength,
  httpProviderHandler,
  ProviderVerifier,
} from '../engine/index';
import type { FetchLike } from '../engine/index';

describe('contractDsl fluent builder', () => {
  it('builds interactions via given/uponReceiving/withRequest/willRespondWith', () => {
    const contract = contractDsl('web', 'api')
      .version('1.0.0')
      .given('user 42 exists')
      .uponReceiving('get user 42')
      .withRequest({ method: 'GET', path: '/users/42' })
      .willRespondWith({
        status: 200,
        body: { id: integer(42), name: 'ann', active: bool(true) },
      })
      .build();
    expect(contract.consumer).toBe('web');
    expect(contract.interactions).toHaveLength(1);
    const i = contract.interactions[0]!;
    expect(i.providerState).toBe('user 42 exists');
    expect(i.description).toBe('get user 42');
    // markers produced rules; literal values stay in the body template
    const rules = i.matchingRules ?? [];
    expect(rules.some((r) => r.path === '$.body.id' && r.matcher === 'integer')).toBe(true);
    expect(rules.some((r) => r.path === '$.body.active' && r.matcher === 'boolean')).toBe(true);
    expect(i.response.body).toEqual({ id: 42, name: 'ann', active: true });
  });

  it('nested like/eachLike expand into rules', () => {
    const contract = contractDsl('web', 'api')
      .uponReceiving('list users')
      .withRequest({ method: 'GET', path: '/users' })
      .willRespondWith({
        status: 200,
        body: {
          users: eachLike({ id: integer(1), email: regex('^[^@]+@[^@]+$') }, 1),
          meta: like({ total: integer(10), page: 1 }),
        },
      })
      .build();
    const i = contract.interactions[0]!;
    const rules = i.matchingRules ?? [];
    expect(rules.some((r) => r.path === '$.body.users' && r.matcher === 'eachLike')).toBe(true);
    expect(rules.some((r) => r.path === '$.body.meta' && r.matcher === 'like')).toBe(true);
    // example body materialized
    expect(i.response.body).toBeDefined();
  });

  it('verifies against a live mock through ProviderVerifier', async () => {
    const contract = contractDsl('web', 'api')
      .uponReceiving('get user')
      .withRequest({ method: 'GET', path: '/users/1' })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: { id: integer(1), created: iso8601('2024-01-01T00:00:00Z') },
      })
      .build();
    const verifier = new ProviderVerifier(() => ({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { id: 77, created: '2030-06-15T12:00:00Z' },
    }));
    const report = await verifier.verify(contract);
    expect(report.success).toBe(true);
  });
});

describe('httpProviderHandler', () => {
  it('adapts fetch-like to ProviderHandler', async () => {
    const fetchFn: FetchLike = async (req) => {
      expect(req.url).toContain('/users/1');
      expect(req.method).toBe('GET');
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        text: async () => JSON.stringify({ id: 1 }),
      };
    };
    const handler = httpProviderHandler('http://api.test', fetchFn);
    const res = await handler({ method: 'GET', path: '/users/1', query: { x: '1' } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 1 });
  });

  it('passes query params and json body', async () => {
    let captured: { url: string; body?: string } | undefined;
    const fetchFn: FetchLike = async (req) => {
      captured = req;
      return { status: 201, headers: {}, text: async () => '' };
    };
    const handler = httpProviderHandler('http://x', fetchFn);
    await handler({ method: 'POST', path: '/items', body: { a: 1 }, query: { q: 'z' } });
    expect(captured?.url).toBe('http://x/items?q=z');
    expect(captured?.body).toBe('{"a":1}');
  });
});
