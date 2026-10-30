/**
 * Tests for VersioningRegistry, BusTransaction/TransactionalBus, and
 * ConsumerLagTracker.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { VersioningRegistry, UpcastError } from '../Versioning';
import { TransactionalBus, TransactionError } from '../BusTransaction';
import { ConsumerLagTracker } from '../ConsumerLag';
import { BusTopology, _resetMessageIds } from '../BusTopology';
import { ManualBusClock2 } from '../types';
import type { RoutedMessage } from '../types';

function msg(routingKey: string): RoutedMessage {
  return { routingKey, headers: {}, payload: {} };
}

// ---------------------------------------------------------------------
// Versioning
// ---------------------------------------------------------------------

describe('VersioningRegistry', () => {
  let reg: VersioningRegistry;

  beforeEach(() => {
    reg = new VersioningRegistry();
  });

  it('chains adjacent upcast steps v1→v2→v3', () => {
    reg.register({ messageType: 'Order', from: 1, to: 2, upcast: (p) => ({ ...(p as object), v2: true }) });
    reg.register({ messageType: 'Order', from: 2, to: 3, upcast: (p) => ({ ...(p as object), v3: true }) });
    const out = reg.upcastTo('Order', { version: 1, payload: { id: 1 } }, 3);
    expect(out).toEqual({ version: 3, payload: { id: 1, v2: true, v3: true } });
  });

  it('identity when already at target', () => {
    const v = { version: 2, payload: { x: 1 } };
    expect(reg.upcastTo('Order', v, 2)).toBe(v);
  });

  it('throws when no chain reaches the target', () => {
    reg.register({ messageType: 'Order', from: 1, to: 2, upcast: (p) => p });
    expect(() => reg.upcastTo('Order', { version: 1, payload: {} }, 5)).toThrow(UpcastError);
  });

  it('prefers shortcut edges (fewer hops)', () => {
    reg.register({ messageType: 'M', from: 1, to: 2, upcast: (p) => ({ ...(p as object), via: '12' }) });
    reg.register({ messageType: 'M', from: 2, to: 3, upcast: (p) => ({ ...(p as object), via2: '23' }) });
    reg.register({ messageType: 'M', from: 1, to: 3, upcast: (p) => ({ ...(p as object), direct: true }) });
    const out = reg.upcastTo('M', { version: 1, payload: {} }, 3);
    expect(out.payload).toEqual({ direct: true });
  });

  it('upcastToLatest walks to newest reachable version', () => {
    reg.register({ messageType: 'M', from: 1, to: 2, upcast: (p) => ({ ...(p as object), b: 1 }) });
    reg.register({ messageType: 'M', from: 2, to: 4, upcast: (p) => ({ ...(p as object), c: 1 }) });
    const out = reg.upcastToLatest('M', { version: 1, payload: {} });
    expect(out.version).toBe(4);
    expect(out.payload).toEqual({ b: 1, c: 1 });
  });

  it('latestVersion returns undefined for unknown types', () => {
    expect(reg.latestVersion('Nope')).toBeUndefined();
  });

  it('rejects self-maps and duplicates', () => {
    expect(() =>
      reg.register({ messageType: 'M', from: 1, to: 1, upcast: (p) => p })
    ).toThrow(UpcastError);
    reg.register({ messageType: 'M', from: 1, to: 2, upcast: (p) => p });
    expect(() =>
      reg.register({ messageType: 'M', from: 1, to: 2, upcast: (p) => p })
    ).toThrow(UpcastError);
  });
});

// ---------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------

describe('BusTransaction', () => {
  let clock: ManualBusClock2;
  let topo: BusTopology;
  let txBus: TransactionalBus;

  beforeEach(() => {
    _resetMessageIds();
    clock = new ManualBusClock2();
    topo = new BusTopology(clock);
    topo.declareExchange('ex', 'fanout');
    topo.declareQueue('a');
    topo.declareQueue('b');
    topo.bind('ex', { queue: 'a', bindKey: '', headerArgs: [] });
    topo.bind('ex', { queue: 'b', bindKey: '', headerArgs: [] });
    txBus = new TransactionalBus(topo, clock);
  });

  it('staged sends are invisible until commit', () => {
    const tx = txBus.begin();
    tx.send('ex', msg('k1')).send('ex', msg('k2'));
    expect(tx.stagedCount).toBe(2);
    expect(topo.queueDepth('a')).toBe(0);
    const out = tx.commit();
    expect(out.status).toBe('committed');
    expect(topo.queueDepth('a')).toBe(2);
    expect(topo.queueDepth('b')).toBe(2);
    expect(out.delivered.length).toBe(4);
  });

  it('rollback discards staged sends', () => {
    const tx = txBus.begin();
    tx.send('ex', msg('k1'));
    const out = tx.rollback();
    expect(out.status).toBe('rolledback');
    expect(topo.queueDepth('a')).toBe(0);
  });

  it('closed transactions reject further ops', () => {
    const tx = txBus.begin();
    tx.commit();
    expect(() => tx.send('ex', msg('k'))).toThrow(TransactionError);
    expect(() => tx.commit()).toThrow(TransactionError);
  });

  it('expired transactions roll back on commit', () => {
    const tx = txBus.begin({ timeoutMs: 1000 });
    tx.send('ex', msg('k'));
    clock.advance(1500);
    expect(() => tx.commit()).toThrow(TransactionError);
    expect(tx.status).toBe('rolledback');
    expect(topo.queueDepth('a')).toBe(0);
  });

  it('inTransaction commits on success, rolls back on throw', () => {
    const r = txBus.inTransaction((tx) => {
      tx.send('ex', msg('k'));
      return 42;
    });
    expect(r.result).toBe(42);
    expect(topo.queueDepth('a')).toBe(1);

    expect(() =>
      txBus.inTransaction((tx) => {
        tx.send('ex', msg('k2'));
        throw new Error('boom');
      })
    ).toThrow('boom');
    expect(topo.queueDepth('a')).toBe(1); // k2 never published
  });
});

// ---------------------------------------------------------------------
// Consumer lag
// ---------------------------------------------------------------------

describe('ConsumerLagTracker', () => {
  let clock: ManualBusClock2;
  let topo: BusTopology;
  let lag: ConsumerLagTracker;

  function publish(n: number): void {
    for (let i = 0; i < n; i++) topo.publish('ex', msg('k'));
  }

  beforeEach(() => {
    clock = new ManualBusClock2();
    topo = new BusTopology(clock);
    topo.declareExchange('ex', 'fanout');
    topo.declareQueue('q');
    topo.bind('ex', { queue: 'q', bindKey: '', headerArgs: [] });
    lag = new ConsumerLagTracker(topo, { clock, windowMs: 60_000 });
  });

  it('currentLag = high watermark − committed offset', () => {
    publish(10);
    expect(lag.currentLag('c1', 'q')).toBe(10);
    lag.commit('c1', 'q', 4);
    expect(lag.currentLag('c1', 'q')).toBe(6);
  });

  it('rejects offset regression', () => {
    publish(10);
    lag.commit('c1', 'q', 8);
    expect(() => lag.commit('c1', 'q', 5)).toThrow(/regression/);
  });

  it('estimates drain rate via OLS and projects ETA', () => {
    publish(100);
    // Consumer commits 1 msg per ms over 10 ms — drain = 1 msg/ms.
    for (let t = 1; t <= 10; t++) {
      clock.advance(1);
      lag.commit('c1', 'q', t);
    }
    const r = lag.report('c1', 'q');
    expect(r.drainRatePerMs).toBeCloseTo(1, 1);
    expect(r.etaMs).not.toBeNull();
    // ~90 remaining at ~1/ms.
    expect(r.etaMs).toBeGreaterThan(50);
    expect(r.etaMs).toBeLessThan(150);
    expect(r.currentLag).toBe(90);
  });

  it('returns null rate with fewer than 2 samples', () => {
    publish(5);
    const r = lag.report('c1', 'q');
    expect(r.drainRatePerMs).toBeNull();
    expect(r.etaMs).toBeNull();
  });

  it('tracks avg/max lag over the window', () => {
    publish(20);
    lag.commit('c1', 'q', 2);
    clock.advance(10);
    lag.commit('c1', 'q', 10);
    clock.advance(10);
    lag.commit('c1', 'q', 20);
    const r = lag.report('c1', 'q');
    expect(r.maxLag).toBe(18);
    expect(r.avgLag).toBeGreaterThan(0);
    expect(r.avgLag).toBeLessThanOrEqual(r.maxLag);
    expect(r.currentLag).toBe(0);
  });

  it('consumersAbove filters by threshold', () => {
    publish(10);
    lag.commit('c1', 'q', 3);
    lag.commit('c2', 'q', 9);
    const hot = lag.consumersAbove(5);
    expect(hot.map((r) => r.consumer)).toEqual(['c1']);
  });

  it('window eviction drops stale samples', () => {
    publish(10);
    lag.commit('c1', 'q', 1);
    clock.advance(120_000); // past the 60s window
    lag.commit('c1', 'q', 5);
    const r = lag.report('c1', 'q');
    // Only the post-eviction sample remains.
    expect(r.maxLag).toBe(5);
  });
});
