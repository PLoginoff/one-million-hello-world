/**
 * Tests for the content-based RoutingTable.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { RoutingTable, RouteTableError, compileTopicPattern } from '../RoutingTable';
import type { RoutedMessage, RoutingRule } from '../types';

function msg(routingKey: string, headers: Record<string, string> = {}): RoutedMessage {
  return { routingKey, headers, payload: {} };
}

describe('compileTopicPattern', () => {
  it('matches literal keys', () => {
    const re = compileTopicPattern('orders.eu.created');
    expect(re.test('orders.eu.created')).toBe(true);
    expect(re.test('orders.us.created')).toBe(false);
    expect(re.test('orders.eu.created.extra')).toBe(false);
  });

  it('matches `*` as exactly one word', () => {
    const re = compileTopicPattern('orders.*.created');
    expect(re.test('orders.eu.created')).toBe(true);
    expect(re.test('orders.created')).toBe(false);
    expect(re.test('orders.eu.west.created')).toBe(false);
  });

  it('matches `#` as zero or more words', () => {
    const re = compileTopicPattern('orders.#');
    expect(re.test('orders')).toBe(true);
    expect(re.test('orders.eu')).toBe(true);
    expect(re.test('orders.eu.created')).toBe(true);
    expect(re.test('orderseu')).toBe(false);
  });

  it('bare `#` matches everything', () => {
    const re = compileTopicPattern('#');
    expect(re.test('anything.at.all')).toBe(true);
  });

  it('mid-pattern `#` matches zero or more words', () => {
    const re = compileTopicPattern('a.#.z');
    expect(re.test('a.z')).toBe(true);
    expect(re.test('a.b.z')).toBe(true);
    expect(re.test('a.b.c.z')).toBe(true);
    expect(re.test('a.b')).toBe(false);
  });

  it('rejects empty words', () => {
    expect(() => compileTopicPattern('a..b')).toThrow();
  });
});

describe('RoutingTable', () => {
  let table: RoutingTable;

  beforeEach(() => {
    table = new RoutingTable();
  });

  it('routes on topic pattern alone', () => {
    table.addRule({
      id: 'r1', keyPattern: 'orders.#', queue: 'q-orders', predicates: [], priority: 10,
    });
    expect(table.route(msg('orders.eu.created'))).toEqual({ ruleId: 'r1', queue: 'q-orders' });
    expect(table.route(msg('billing.eu.created'))).toBeNull();
  });

  it('applies header predicates (content-based routing)', () => {
    table.addRule({
      id: 'vip', keyPattern: 'orders.#', queue: 'q-vip',
      predicates: [{ kind: 'equals', header: 'tier', value: 'vip' }],
      priority: 1,
    });
    table.addRule({
      id: 'std', keyPattern: 'orders.#', queue: 'q-std', predicates: [], priority: 5,
    });
    expect(table.route(msg('orders.eu', { tier: 'vip' }))?.queue).toBe('q-vip');
    expect(table.route(msg('orders.eu', { tier: 'free' }))?.queue).toBe('q-std');
  });

  it('evaluates rules in priority order — first match wins', () => {
    const low: RoutingRule = {
      id: 'low', keyPattern: '#', queue: 'q-low', predicates: [], priority: 1,
    };
    const high: RoutingRule = {
      id: 'high', keyPattern: '#', queue: 'q-high', predicates: [], priority: 9,
    };
    table.addRule(high);
    table.addRule(low);
    expect(table.route(msg('x'))?.queue).toBe('q-low');
  });

  it('supports exists, match and in predicates', () => {
    table.addRule({
      id: 'r', keyPattern: '#', queue: 'q',
      predicates: [
        { kind: 'exists', header: 'tenant' },
        { kind: 'match', header: 'region', pattern: 'eu-*' },
        { kind: 'in', header: 'env', values: ['prod', 'staging'] },
      ],
      priority: 1,
    });
    expect(
      table.route(msg('k', { tenant: 't1', region: 'eu-west', env: 'prod' }))?.queue
    ).toBe('q');
    expect(
      table.route(msg('k', { tenant: 't1', region: 'us-east', env: 'prod' }))
    ).toBeNull();
    expect(table.route(msg('k', { region: 'eu-west', env: 'prod' }))).toBeNull();
    expect(
      table.route(msg('k', { tenant: 't1', region: 'eu-west', env: 'dev' }))
    ).toBeNull();
  });

  it('glob `?` matches exactly one char', () => {
    table.addRule({
      id: 'r', keyPattern: '#', queue: 'q',
      predicates: [{ kind: 'match', header: 'v', pattern: 'v?.*' }],
      priority: 1,
    });
    expect(table.route(msg('k', { v: 'v1.2' }))).not.toBeNull();
    expect(table.route(msg('k', { v: 'vx' }))).toBeNull();
  });

  it('routeAll returns every matching rule', () => {
    table.addRule({ id: 'a', keyPattern: 'x.#', queue: 'q1', predicates: [], priority: 1 });
    table.addRule({ id: 'b', keyPattern: 'x.y', queue: 'q2', predicates: [], priority: 2 });
    table.addRule({ id: 'c', keyPattern: 'z.#', queue: 'q3', predicates: [], priority: 3 });
    const all = table.routeAll(msg('x.y'));
    expect(all.map((d) => d.ruleId)).toEqual(['a', 'b']);
  });

  it('removeRule deletes by id', () => {
    table.addRule({ id: 'a', keyPattern: '#', queue: 'q', predicates: [], priority: 1 });
    expect(table.removeRule('a')).toBe(true);
    expect(table.removeRule('a')).toBe(false);
    expect(table.route(msg('k'))).toBeNull();
  });

  it('duplicate rule ids throw', () => {
    const r: RoutingRule = { id: 'a', keyPattern: '#', queue: 'q', predicates: [], priority: 1 };
    table.addRule(r);
    expect(() => table.addRule(r)).toThrow(RouteTableError);
  });
});
