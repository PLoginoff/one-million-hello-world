/**
 * ContractBroker tests — pact serialization, mock provider, deployability.
 */

import { describe, it, expect } from 'bun:test';
import {
  toPactDocument,
  fromPactDocument,
  MockProvider,
  VerificationStore,
  versionSatisfies,
  ContractBuilder,
  parseSemver,
} from '../engine/index';
import type { Contract } from '../engine/index';

function contract(): Contract {
  return new ContractBuilder('web', 'api')
    .version('1.2.0')
    .matchingRule({ path: '$.body.id', matcher: 'integer' })
    .interaction({
      id: 'i1',
      description: 'get user',
      providerState: 'user exists',
      request: {
        method: 'GET',
        path: '/users/:id',
        headers: { Accept: 'application/json' },
        query: { verbose: 'true' },
      },
      response: {
        status: 200,
        body: { id: 1, name: 'x' },
      },
      matchingRules: [{ path: '$.body.name', matcher: 'type' }],
    })
    .interaction({
      id: 'i2',
      description: 'create user',
      request: { method: 'POST', path: '/users', body: { name: 'a', age: 1 } },
      response: { status: 201, body: { id: 99 } },
      matchingRules: [{ path: '$.body.age', matcher: 'integer' }],
    })
    .build();
}

describe('pact serialization', () => {
  it('round-trips a contract through the pact document shape', () => {
    const doc = toPactDocument(contract());
    expect(doc.consumer.name).toBe('web');
    expect(doc.provider.name).toBe('api');
    expect(doc.metadata.contractVersion).toBe('1.2.0');
    expect(doc.interactions).toHaveLength(2);
    // rules grouped under 'body' section
    expect(doc.interactions[0]?.matchingRules?.body).toBeDefined();

    const back = fromPactDocument(doc);
    expect(back.consumer).toBe('web');
    expect(back.version).toEqual({ major: 1, minor: 2, patch: 0 });
    expect(back.interactions).toHaveLength(2);
    expect(back.interactions[0]?.matchingRules?.length).toBeGreaterThan(0);
  });
});

describe('MockProvider', () => {
  const mock = new MockProvider(contract());

  it('matches templated paths and returns stubbed response', () => {
    const hit = mock.handle(
      {
        method: 'GET',
        path: '/users/42',
        headers: { Accept: 'application/json' },
        query: { verbose: 'true' },
      },
      'user exists'
    );
    expect('response' in hit).toBe(true);
    if ('response' in hit) {
      expect(hit.response.status).toBe(200);
      expect(hit.interaction.id).toBe('i1');
    }
  });

  it('rejects wrong method / provider state', () => {
    const miss = mock.handle(
      { method: 'DELETE', path: '/users/42' },
      'user exists'
    );
    expect('candidates' in miss).toBe(true);
    const miss2 = mock.handle(
      {
        method: 'GET',
        path: '/users/42',
        headers: { Accept: 'application/json' },
        query: { verbose: 'true' },
      },
      'different state'
    );
    expect('candidates' in miss2).toBe(true);
  });

  it('ranks near-miss candidates with mismatch diffs', () => {
    const miss = mock.handle(
      {
        method: 'GET',
        path: '/users/42',
        headers: { Accept: 'application/json' },
        query: { verbose: 'false' }, // wrong value
      },
      'user exists'
    );
    expect('candidates' in miss && miss.candidates.length > 0).toBe(true);
    if ('candidates' in miss) {
      expect(miss.candidates[0]?.mismatches[0]?.path).toBe('$.query.verbose');
    }
  });

  it('verifies all interactions were exercised', () => {
    const m = new MockProvider(contract());
    m.handle(
      {
        method: 'GET',
        path: '/users/1',
        headers: { Accept: 'application/json' },
        query: { verbose: 'true' },
      },
      'user exists'
    );
    const v = m.verifyAllInteractionsCalled();
    expect(v.complete).toBe(false);
    expect(v.missing.map((x) => x.id)).toEqual(['i2']);
    m.reset();
    expect(m.received).toHaveLength(0);
  });
});

describe('VerificationStore', () => {
  it('records and queries can-deploy', () => {
    const store = new VerificationStore();
    store.record({
      contractConsumer: 'web',
      contractProvider: 'api',
      contractVersion: '1.2.0',
      providerVersion: '3.0.0',
      success: true,
      verifiedAt: 1,
      failedInteractions: [],
    });
    expect(store.canDeploy('web', 'api', '1.2.0', '3.0.0')).toBe(true);
    expect(store.canDeploy('web', 'api', '1.2.0', '4.0.0')).toBe(false);
    expect(store.latest('web', 'api', '1.2.0')?.providerVersion).toBe('3.0.0');
  });
});

describe('versionSatisfies', () => {
  it('checks min/max/major constraints', () => {
    const v = parseSemver('1.4.2');
    expect(versionSatisfies(v, { major: 1 })).toBe(true);
    expect(versionSatisfies(v, { major: 2 })).toBe(false);
    expect(versionSatisfies(v, { min: parseSemver('1.0.0'), max: parseSemver('2.0.0') })).toBe(true);
    expect(versionSatisfies(v, { min: parseSemver('1.5.0') })).toBe(false);
  });
});
