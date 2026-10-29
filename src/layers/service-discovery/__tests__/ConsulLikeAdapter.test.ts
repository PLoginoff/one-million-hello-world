/**
 * Tests for ConsulLikeAdapter (mock Consul).
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ConsulLikeAdapter, aggregateHealth } from '../adapters/ConsulLikeAdapter';
import { createInstance } from '../types/service-instance';

describe('aggregateHealth', () => {
  it('returns unknown for empty checks', () => {
    expect(aggregateHealth([])).toBe('unknown');
  });
  it('returns up when all passing', () => {
    expect(
      aggregateHealth([
        { checkId: 'c1', name: 'http', status: 'passing' },
        { checkId: 'c2', name: 'tcp', status: 'passing' },
      ])
    ).toBe('up');
  });
  it('returns down when any critical', () => {
    expect(
      aggregateHealth([
        { checkId: 'c1', name: 'http', status: 'passing' },
        { checkId: 'c2', name: 'tcp', status: 'critical' },
      ])
    ).toBe('down');
  });
  it('returns unknown when only warnings', () => {
    expect(
      aggregateHealth([
        { checkId: 'c1', name: 'http', status: 'passing' },
        { checkId: 'c2', name: 'disk', status: 'warning' },
      ])
    ).toBe('unknown');
  });
});

describe('ConsulLikeAdapter', () => {
  let consul: ConsulLikeAdapter;

  beforeEach(() => {
    consul = new ConsulLikeAdapter('node-1', 'dc1');
  });

  it('registers a service and lists it in catalog', () => {
    consul.registerService({
      id: 'api-1',
      name: 'api',
      address: '10.0.0.1',
      port: 8080,
      tags: ['v1'],
    });
    const svcs = consul.services();
    expect(svcs.has('api')).toBe(true);
    expect(svcs.get('api')).toContain('v1');
  });

  it('healthy() returns only passing instances', () => {
    consul.registerService({
      id: 'api-1',
      name: 'api',
      address: '10.0.0.1',
      port: 8080,
      check: { status: 'passing' },
    });
    consul.registerService({
      id: 'api-2',
      name: 'api',
      address: '10.0.0.2',
      port: 8080,
      check: { status: 'critical' },
    });
    const passing = consul.healthy('api');
    expect(passing.map((e) => e.id)).toEqual(['api-1']);
    const all = consul.healthy('api', false);
    expect(all.length).toBe(2);
  });

  it('setCheckStatus transitions health and emits event', () => {
    const events: string[] = [];
    consul.watch((e) => events.push(`${e.type}:${e.previousHealth}→${e.instance.health}`));
    consul.registerService({
      id: 'api-1',
      name: 'api',
      address: '10.0.0.1',
      port: 8080,
      check: { checkId: 'chk-1', status: 'passing' },
    });
    consul.setCheckStatus('api-1', 'chk-1', 'critical');
    expect(events).toContain('instance-health-changed:up→down');
    consul.setCheckStatus('api-1', 'chk-1', 'passing');
    expect(events).toContain('instance-health-changed:down→up');
  });

  it('IServiceRegistry surface works (register/deregister/query)', () => {
    const i = createInstance('x', 'api', '10.0.0.9', 9000);
    consul.register(i);
    expect(consul.size).toBe(1);
    expect(consul.get('x')).toBeDefined();
    expect(consul.query({ serviceName: 'api' }).map((x) => x.id)).toEqual(['x']);
    expect(consul.deregister('x')).toBe(true);
    expect(consul.size).toBe(0);
  });

  it('heartbeat emits event for existing service', () => {
    const events: string[] = [];
    consul.watch((e) => events.push(e.type));
    consul.registerService({ id: 'a', name: 'api', address: 'h', port: 1 });
    expect(consul.heartbeat('a')).toBe(true);
    expect(events).toContain('instance-heartbeat');
    expect(consul.heartbeat('missing')).toBe(false);
  });
});
