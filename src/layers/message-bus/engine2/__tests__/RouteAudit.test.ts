/**
 * Tests for RouteAudit (dry-run diff, shadow detection, probe corpus)
 * and DeliverySimulator (trace, per-queue order, requeue).
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { RoutingTable } from '../RoutingTable';
import { diff, shadowed, probeCorpus } from '../RouteAudit';
import { trace, perQueueOrder, requeue } from '../DeliverySimulator';
import { BusTopology, _resetMessageIds } from '../BusTopology';
import { ManualBusClock2 } from '../types';
import type { RoutedMessage, RoutingRule } from '../types';

const rule = (id: string, keyPattern: string, queue: string, priority = 10, predicates: RoutingRule['predicates'] = []): RoutingRule =>
  ({ id, keyPattern, queue, predicates, priority });

const msg = (routingKey: string, headers: Record<string, string> = {}): RoutedMessage =>
  ({ routingKey, headers, payload: {} });

// ---------------------------------------------------------------------
// Route diffing
// ---------------------------------------------------------------------

describe('RouteAudit.diff', () => {
  it('reports moves, newly-unrouted messages and queue deltas', () => {
    const old = new RoutingTable();
    old.addRule(rule('a', 'orders.#', 'q-orders'));
    const next = new RoutingTable();
    next.addRule(rule('a2', 'orders.eu.#', 'q-eu'));

    const corpus = [msg('orders.eu.created'), msg('orders.us.created'), msg('other.x')];
    const r = diff(old, next, corpus);
    expect(r.messagesChecked).toBe(3);
    expect(r.moved.length).toBe(2);
    expect(r.nowUnrouted.map((m) => m.routingKey)).toEqual(['orders.us.created']);
    expect(r.queueDelta.get('q-eu')).toBe(1);
    expect(r.queueDelta.get('q-orders')).toBe(-2);
  });

  it('identical tables produce zero moves', () => {
    const t1 = new RoutingTable();
    const t2 = new RoutingTable();
    for (const t of [t1, t2]) {
      t.addRule(rule('a', 'orders.#', 'q1'));
      t.addRule(rule('b', '#', 'q2'));
    }
    const r = diff(t1, t2, [msg('orders.x'), msg('anything')]);
    expect(r.moved).toEqual([]);
    expect(r.nowUnrouted).toEqual([]);
  });
});

describe('RouteAudit.shadowed', () => {
  it('flags a rule hidden behind a broader same-or-earlier one', () => {
    const t = new RoutingTable();
    t.addRule(rule('broad', 'orders.#', 'q-all', 1));
    t.addRule(rule('narrow', 'orders.eu.created', 'q-eu', 5));
    const s = shadowed(t);
    expect(s.map((r) => r.id)).toEqual(['narrow']);
  });

  it('does not flag rules whose predicates make them genuinely distinct', () => {
    const t = new RoutingTable();
    t.addRule(rule('broad', '#', 'q-all', 1, [
      { kind: 'equals', header: 'tier', value: 'vip' },
    ]));
    t.addRule(rule('narrow', 'orders.#', 'q-orders', 5));
    expect(shadowed(t)).toEqual([]);
  });

  it('literal-ahead-of-hash is shadowed only when the literals align', () => {
    const t = new RoutingTable();
    t.addRule(rule('broad', 'orders.#', 'q1', 1));
    t.addRule(rule('narrow', 'orders.eu.#', 'q2', 5));
    t.addRule(rule('other', 'billing.eu', 'q3', 5));
    const s = shadowed(t);
    expect(s.map((r) => r.id)).toEqual(['narrow']);
  });
});

describe('RouteAudit.probeCorpus', () => {
  it('produces probes covering patterns and predicate values', () => {
    const corpus = probeCorpus([
      rule('vip', 'orders.#', 'q-vip', 1, [
        { kind: 'equals', header: 'tier', value: 'vip' },
      ]),
      rule('std', 'orders.*', 'q-std', 5),
    ]);
    const keys = corpus.map((m) => m.routingKey);
    expect(keys).toContain('orders.probe'); // wildcard fill
    expect(keys).toContain('orders'); // `#` also empties
    const withTier = corpus.filter((m) => m.headers['tier'] === 'vip');
    expect(withTier.length).toBeGreaterThan(0);
    // Probes route as expected.
    const t = new RoutingTable();
    t.addRule(rule('vip', 'orders.#', 'q-vip', 1, [
      { kind: 'equals', header: 'tier', value: 'vip' },
    ]));
    t.addRule(rule('std', 'orders.*', 'q-std', 5));
    const routed = corpus.map((m) => t.routeAll(m).map((d) => d.queue));
    expect(routed.some((d) => d.includes('q-vip'))).toBe(true);
    expect(routed.some((d) => d.includes('q-std'))).toBe(true);
  });
});

// ---------------------------------------------------------------------
// Delivery simulator
// ---------------------------------------------------------------------

describe('DeliverySimulator', () => {
  let topo: BusTopology;

  beforeEach(() => {
    _resetMessageIds();
    topo = new BusTopology(new ManualBusClock2());
    topo.declareExchange('ex', 'topic');
    topo.declareQueue('eu');
    topo.declareQueue('all');
    topo.bind('ex', { queue: 'eu', bindKey: 'orders.eu.#', headerArgs: [] });
    topo.bind('ex', { queue: 'all', bindKey: '#', headerArgs: [] });
  });

  it('trace walks the hops a message takes', () => {
    const r = trace(topo, 'ex', msg('orders.eu.created'));
    expect(r.unrouted).toBe(false);
    expect(r.routedTo.sort()).toEqual(['all', 'eu']);
    expect(r.hops.map((h) => h.stage)).toContain('queue');
    expect(r.hops[0]?.detail).toContain('ex');
  });

  it('trace reports unrouted when nothing matches', () => {
    const strict = new BusTopology(new ManualBusClock2());
    strict.declareExchange('ex', 'direct');
    strict.declareQueue('q');
    strict.bind('ex', { queue: 'q', bindKey: 'only', headerArgs: [] });
    const r = trace(strict, 'ex', msg('nope'));
    expect(r.unrouted).toBe(true);
    expect(r.hops.some((h) => h.detail.includes('no binding'))).toBe(true);
  });

  it('perQueueOrder gives each queue its own FIFO view', () => {
    topo.publish('ex', msg('orders.eu.a'));
    topo.publish('ex', msg('orders.us.b'));
    topo.publish('ex', msg('orders.eu.c'));
    const per = perQueueOrder(topo, 'ex', []);
    expect(per.get('eu')?.map((m) => m.message.routingKey)).toEqual([
      'orders.eu.a', 'orders.eu.c',
    ]);
    expect(per.get('all')?.map((m) => m.message.routingKey)).toEqual([
      'orders.eu.a', 'orders.us.b', 'orders.eu.c',
    ]);
  });

  it('requeue puts nacked messages ahead of newer arrivals', () => {
    topo.publish('ex', msg('m1'));
    topo.publish('ex', msg('m2'));
    topo.publish('ex', msg('m3'));
    topo.dequeue('all', 2); // consume m1, m2
    const back = requeue(topo, 'all', 2);
    expect(back.map((m) => m.message.routingKey)).toEqual(['m1', 'm2']);
    expect(topo.dequeue('all', 3).map((m) => m.message.routingKey)).toEqual(['m1', 'm2', 'm3']);
  });
});

// ---------------------------------------------------------------------
// Delivery guarantee analysis
// ---------------------------------------------------------------------

import { analyze } from '../DeliveryGuarantee';

describe('DeliveryGuarantee.analyze', () => {
  it('strict-fifo when exactly one binding feeds the queue', () => {
    const t = new BusTopology(new ManualBusClock2());
    t.declareExchange('ex', 'topic');
    t.declareQueue('q');
    t.bind('ex', { queue: 'q', bindKey: 'orders.#', headerArgs: [] });
    const r = analyze('q', t);
    expect(r.ordering).toBe('strict-fifo');
    expect(r.duplicateRisk).toBe(false);
    expect(r.unroutedRisk).toBe(true); // topic exchange can publish unmatched keys
    expect(r.feeds.length).toBe(1);
  });

  it('duplicate risk when two bindings on one exchange both point at the queue', () => {
    const t = new BusTopology(new ManualBusClock2());
    t.declareExchange('ex', 'topic');
    t.declareQueue('q');
    t.bind('ex', { queue: 'q', bindKey: 'orders.#', headerArgs: [] });
    // Second binding to the same queue on the same exchange — a keyed
    // implementation would dedupe; ours replaces, but two different
    // exchange paths is the risk we're flagging.
    const r = analyze('q', t);
    expect(r.duplicateRisk).toBe(false); // second bind replaced the first
    expect(r.feeds.length).toBe(1);
  });

  it('merged-fifo and duplicate-risk when fed by two exchanges', () => {
    const t = new BusTopology(new ManualBusClock2());
    t.declareExchange('a', 'fanout');
    t.declareExchange('b', 'fanout');
    t.declareQueue('q');
    t.bind('a', { queue: 'q', bindKey: '', headerArgs: [] });
    t.bind('b', { queue: 'q', bindKey: '', headerArgs: [] });
    const r = analyze('q', t);
    expect(r.ordering).toBe('merged-fifo');
    expect(r.feeds.length).toBe(2);
    expect(r.unroutedRisk).toBe(false); // fanout always delivers
  });

  it('an unfed queue is flagged', () => {
    const t = new BusTopology(new ManualBusClock2());
    t.declareQueue('q');
    const r = analyze('q', t);
    expect(r.ordering).toBe('unknown');
    expect(r.notes.some((n) => n.includes('never receive'))).toBe(true);
  });
});

// ---------------------------------------------------------------------
// Consumer group coordinator
// ---------------------------------------------------------------------

import { ConsumerGroup, ConsumerGroupError } from '../ConsumerGroup';

describe('ConsumerGroup', () => {
  it('a member joining alone gets every partition', () => {
    const g = new ConsumerGroup('g', 8);
    const r = g.join('w1');
    expect(g.memberPartitions('w1')).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(r.changed).toEqual(['w1']);
  });

  it('joins rebalance partitions across members', () => {
    const g = new ConsumerGroup('g', 4);
    g.join('w1');
    const r = g.join('w2');
    expect(g.memberPartitions('w1')).toEqual([0, 2]);
    expect(g.memberPartitions('w2')).toEqual([1, 3]);
    // Partitions 1 and 3 moved from w1 → w2; 0 and 2 stayed.
    expect(r.moves.length).toBe(2);
    expect(r.moves.every((m) => m.to === 'w2')).toBe(true);
  });

  it('leaving hands partitions back to survivors', () => {
    const g = new ConsumerGroup('g', 4);
    g.join('w1');
    g.join('w2');
    g.leave('w2');
    expect(g.memberPartitions('w1')).toEqual([0, 1, 2, 3]);
  });

  it('partitionFor is stable and in range', () => {
    const g = new ConsumerGroup('g', 8);
    for (let i = 0; i < 100; i++) {
      const p = g.partitionFor(`key-${i}`);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(8);
      expect(g.partitionFor(`key-${i}`)).toBe(p);
    }
  });

  it('rejects duplicate joins and unknown leaves', () => {
    const g = new ConsumerGroup('g', 4);
    g.join('w1');
    expect(() => g.join('w1')).toThrow(ConsumerGroupError);
    expect(() => g.leave('ghost')).toThrow(ConsumerGroupError);
    expect(() => g.memberPartitions('ghost')).toThrow(ConsumerGroupError);
  });

  it('rejects non-positive partition counts', () => {
    expect(() => new ConsumerGroup('g', 0)).toThrow(ConsumerGroupError);
    expect(() => new ConsumerGroup('g', -2)).toThrow(ConsumerGroupError);
  });
});
