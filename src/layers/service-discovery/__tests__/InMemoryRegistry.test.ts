/**
 * Tests for InMemoryRegistry + heartbeat lifecycle.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { InMemoryRegistry } from '../strategies/InMemoryRegistry';
import { HeartbeatHealthChecker } from '../strategies/HeartbeatHealthChecker';
import { WatchNotifier } from '../strategies/WatchNotifier';
import { createInstance } from '../types/service-instance';

const TTL = 1000;

function registry() {
  return new InMemoryRegistry({ heartbeatTtlMs: TTL, evictAfterMissed: 2 });
}

function inst(id: string, svc = 'api') {
  return createInstance(id, svc, '10.0.0.1', 8080, { now: 0 });
}

describe('InMemoryRegistry', () => {
  let reg: InMemoryRegistry;

  beforeEach(() => {
    reg = registry();
  });

  it('registers and looks up by id and by service name', () => {
    reg.register(inst('a'));
    reg.register(inst('b'));
    reg.register(inst('c', 'db'));
    expect(reg.size).toBe(3);
    expect(reg.get('a')!.serviceName).toBe('api');
    expect(reg.query({ serviceName: 'api' }).map((i) => i.id)).toEqual(['a', 'b']);
    expect(reg.serviceNames().sort()).toEqual(['api', 'db']);
  });

  it('re-registering an id replaces the old instance', () => {
    reg.register(inst('a'));
    reg.register(inst('a')); // same id
    expect(reg.size).toBe(1);
  });

  it('deregister removes from both indexes', () => {
    reg.register(inst('a'));
    expect(reg.deregister('a')).toBe(true);
    expect(reg.get('a')).toBeUndefined();
    expect(reg.query({ serviceName: 'api' }).length).toBe(0);
    expect(reg.deregister('a')).toBe(false);
  });

  it('query filters by required tags', () => {
    const i1 = createInstance('a', 'api', '10.0.0.1', 8080, { tags: ['v1', 'us-east'] });
    const i2 = createInstance('b', 'api', '10.0.0.2', 8080, { tags: ['v2'] });
    reg.register(i1);
    reg.register(i2);
    const v1 = reg.query({ serviceName: 'api', requireTags: ['v1'] });
    expect(v1.map((x) => x.id)).toEqual(['a']);
  });

  it('query supports anyTags and metadataEquals', () => {
    const i1 = createInstance('a', 'api', '10.0.0.1', 8080, {
      tags: ['blue'],
      metadata: { version: '1' },
    });
    const i2 = createInstance('b', 'api', '10.0.0.2', 8080, {
      tags: ['green'],
      metadata: { version: '2' },
    });
    reg.register(i1);
    reg.register(i2);
    expect(reg.query({ anyTags: ['green'] }).map((x) => x.id)).toEqual(['b']);
    expect(reg.query({ metadataEquals: { version: '1' } }).map((x) => x.id)).toEqual(['a']);
  });

  it('heartbeat marks starting instance up and resets misses', () => {
    const i = inst('a');
    reg.register(i);
    expect(i.health).toBe('starting');
    expect(reg.heartbeat('a', 100)).toBe(true);
    expect(i.health).toBe('up');
    expect(i.missedHeartbeats).toBe(0);
  });

  it('tick marks stale instance unknown then evicts', () => {
    const i = inst('a');
    reg.register(i);
    reg.heartbeat('a', 100);

    // 1st sweep at t=2000: 1900ms stale > 1000 → unknown, missed=1
    const s1 = reg.tick(2000);
    expect(s1.expired.map((x) => x.id)).toEqual(['a']);
    expect(s1.evicted.length).toBe(0);
    expect(i.health).toBe('unknown');
    expect(i.missedHeartbeats).toBe(1);

    // 2nd sweep at t=4000: missed=2 (== evictAfter, not >)
    reg.tick(4000);
    expect(i.missedHeartbeats).toBe(2);
    expect(reg.get('a')).toBeDefined();

    // 3rd sweep at t=6000: missed=3 > 2 → evicted
    const s3 = reg.tick(6000);
    expect(s3.evicted.map((x) => x.id)).toEqual(['a']);
    expect(reg.get('a')).toBeUndefined();
  });

  it('heartbeat between ticks prevents eviction', () => {
    const i = inst('a');
    reg.register(i);
    reg.heartbeat('a', 100);
    reg.tick(2000); // unknown, missed=1
    reg.heartbeat('a', 2500); // reset
    expect(i.missedHeartbeats).toBe(0);
    reg.tick(3000); // fresh heartbeat → not stale
    expect(reg.get('a')).toBeDefined();
    expect(reg.get('a')!.missedHeartbeats).toBe(0);
  });

  it('watchers receive events in order', () => {
    const events: string[] = [];
    reg.watch((e) => events.push(`${e.type}:${e.instance.id}`));
    reg.register(inst('a'));
    reg.heartbeat('a', 10);
    reg.deregister('a');
    expect(events).toEqual([
      'instance-registered:a',
      'instance-health-changed:a',
      'instance-heartbeat:a',
      'instance-deregistered:a',
    ]);
  });

  it('unsubscribe stops delivery', () => {
    const events: string[] = [];
    const unsub = reg.watch((e) => events.push(e.type));
    reg.register(inst('a'));
    unsub();
    reg.register(inst('b'));
    expect(events.length).toBe(1);
  });
});

describe('HeartbeatHealthChecker', () => {
  it('wraps registry tick and counts sweeps', () => {
    const reg = registry();
    const hc = new HeartbeatHealthChecker(reg);
    reg.register(inst('a'));
    hc.heartbeat('a', 100);
    const s = hc.tick(2000);
    expect(s.expired.length).toBe(1);
    expect(hc.sweepCount).toBe(1);
    expect(hc.lastSweepAt).toBe(2000);
  });

  it('healthyFor returns only up instances', () => {
    const reg = registry();
    const hc = new HeartbeatHealthChecker(reg);
    reg.register(inst('a'));
    reg.register(inst('b'));
    hc.heartbeat('a', 100);
    hc.heartbeat('b', 100);
    expect(hc.healthyFor('api').map((i) => i.id).sort()).toEqual(['a', 'b']);
  });
});

describe('WatchNotifier', () => {
  it('filters events per subscription', () => {
    const reg = registry();
    const notifier = new WatchNotifier(reg);
    notifier.start();

    const api: string[] = [];
    const db: string[] = [];
    notifier.subscribe({ serviceName: 'api' }, (e) => api.push(e.instance.id));
    notifier.subscribe({ serviceName: 'db' }, (e) => db.push(e.instance.id));

    reg.register(inst('a', 'api'));
    reg.register(inst('x', 'db'));
    reg.register(inst('b', 'api'));

    expect(api).toEqual(['a', 'b']);
    expect(db).toEqual(['x']);
    notifier.stop();
  });

  it('replays buffered events to late subscribers', () => {
    const reg = registry();
    const notifier = new WatchNotifier(reg);
    notifier.start();

    reg.register(inst('a', 'api'));
    reg.register(inst('b', 'api'));

    const seen: string[] = [];
    notifier.subscribe({ serviceName: 'api' }, (e) => seen.push(e.instance.id), true);
    expect(seen).toEqual(['a', 'b']);
    notifier.stop();
  });

  it('isolates subscriber exceptions', () => {
    const reg = registry();
    const notifier = new WatchNotifier(reg);
    notifier.start();
    let calls = 0;
    notifier.subscribe({}, () => {
      calls++;
      throw new Error('boom');
    });
    notifier.subscribe({}, () => {
      calls++;
    });
    reg.register(inst('a'));
    // Both handlers invoked despite first throwing.
    expect(notifier.subscriptionCount).toBe(2);
    // first throws (not counted), second counts.
    expect(notifier.deliveries).toBe(1);
    expect(calls).toBe(2);
    notifier.stop();
  });
});
