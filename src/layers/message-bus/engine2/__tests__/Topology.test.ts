/**
 * Tests for BusTopology (exchanges, queues, bindings).
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { BusTopology, TopologyError, _resetMessageIds } from '../BusTopology';
import { ManualBusClock2 } from '../types';
import type { RoutedMessage } from '../types';

function msg(routingKey: string, headers: Record<string, string> = {}): RoutedMessage {
  return { routingKey, headers, payload: { n: 1 } };
}

describe('BusTopology', () => {
  let bus: BusTopology;

  beforeEach(() => {
    _resetMessageIds();
    bus = new BusTopology(new ManualBusClock2());
  });

  it('declares exchanges and queues idempotently', () => {
    bus.declareExchange('ex', 'topic');
    bus.declareExchange('ex', 'topic'); // no throw
    bus.declareQueue('q');
    bus.declareQueue('q');
    expect(bus.hasExchange('ex')).toBe(true);
    expect(bus.hasQueue('q')).toBe(true);
  });

  it('rejects redeclaring an exchange with a different kind', () => {
    bus.declareExchange('ex', 'topic');
    expect(() => bus.declareExchange('ex', 'direct')).toThrow(TopologyError);
  });

  it('routes topic bindings by pattern', () => {
    bus.declareExchange('ex', 'topic');
    bus.declareQueue('eu');
    bus.declareQueue('all');
    bus.bind('ex', { queue: 'eu', bindKey: 'orders.eu.#', headerArgs: [] });
    bus.bind('ex', { queue: 'all', bindKey: '#', headerArgs: [] });

    const dests = bus.publish('ex', msg('orders.eu.created'));
    expect(dests.sort()).toEqual(['all', 'eu']);
    expect(bus.queueDepth('eu')).toBe(1);
    expect(bus.queueDepth('all')).toBe(1);
  });

  it('routes direct bindings on exact key', () => {
    bus.declareExchange('ex', 'direct');
    bus.declareQueue('q');
    bus.bind('ex', { queue: 'q', bindKey: 'exact', headerArgs: [] });
    expect(bus.publish('ex', msg('exact'))).toEqual(['q']);
    expect(bus.publish('ex', msg('other'))).toEqual([]);
  });

  it('fanout delivers to every bound queue', () => {
    bus.declareExchange('ex', 'fanout');
    bus.declareQueue('a');
    bus.declareQueue('b');
    bus.bind('ex', { queue: 'a', bindKey: '', headerArgs: [] });
    bus.bind('ex', { queue: 'b', bindKey: '', headerArgs: [] });
    const d = bus.publish('ex', msg('anything'));
    expect(d.sort()).toEqual(['a', 'b']);
  });

  it('headers exchange matches on headerArgs', () => {
    bus.declareExchange('ex', 'headers');
    bus.declareQueue('q');
    bus.bind('ex', {
      queue: 'q',
      bindKey: '',
      headerArgs: [
        { kind: 'equals', header: 'format', value: 'json' },
        { kind: 'in', header: 'region', values: ['eu', 'us'] },
      ],
    });
    expect(bus.publish('ex', msg('ignored', { format: 'json', region: 'eu' }))).toEqual(['q']);
    expect(bus.publish('ex', msg('ignored', { format: 'xml', region: 'eu' }))).toEqual([]);
  });

  it('unbind removes the binding', () => {
    bus.declareExchange('ex', 'topic');
    bus.declareQueue('q');
    bus.bind('ex', { queue: 'q', bindKey: '#', headerArgs: [] });
    expect(bus.unbind('ex', 'q')).toBe(true);
    expect(bus.publish('ex', msg('k'))).toEqual([]);
  });

  it('dequeue is FIFO and peek does not consume', () => {
    bus.declareExchange('ex', 'fanout');
    bus.declareQueue('q');
    bus.bind('ex', { queue: 'q', bindKey: '', headerArgs: [] });
    bus.publish('ex', msg('one'));
    bus.publish('ex', msg('two'));
    bus.publish('ex', msg('three'));

    expect(bus.peek('q', 2).map((m) => m.message.routingKey)).toEqual(['one', 'two']);
    expect(bus.queueDepth('q')).toBe(3);
    const got = bus.dequeue('q', 2);
    expect(got.map((m) => m.message.routingKey)).toEqual(['one', 'two']);
    expect(bus.dequeue('q', 5).map((m) => m.message.routingKey)).toEqual(['three']);
    expect(bus.queueDepth('q')).toBe(0);
  });

  it('maxLength drops the oldest message', () => {
    bus.declareExchange('ex', 'fanout');
    bus.declareQueue('q', { maxLength: 2 });
    bus.bind('ex', { queue: 'q', bindKey: '', headerArgs: [] });
    bus.publish('ex', msg('a'));
    bus.publish('ex', msg('b'));
    bus.publish('ex', msg('c'));
    expect(bus.queueDepth('q')).toBe(2);
    expect(bus.dequeue('q', 10).map((m) => m.message.routingKey)).toEqual(['b', 'c']);
    expect(bus.queueDropped('q')).toBe(1);
  });

  it('deleteQueue drops its bindings', () => {
    bus.declareExchange('ex', 'fanout');
    bus.declareQueue('q');
    bus.bind('ex', { queue: 'q', bindKey: '', headerArgs: [] });
    expect(bus.deleteQueue('q')).toBe(true);
    expect(bus.publish('ex', msg('k'))).toEqual([]);
  });

  it('publishing to an unknown exchange throws', () => {
    expect(() => bus.publish('nope', msg('k'))).toThrow(TopologyError);
  });

  it('binding to an unknown queue throws', () => {
    bus.declareExchange('ex', 'topic');
    expect(() =>
      bus.bind('ex', { queue: 'ghost', bindKey: '#', headerArgs: [] })
    ).toThrow(TopologyError);
  });

  it('snapshot/restore round-trips the declaration', () => {
    bus.declareExchange('ex', 'topic', true);
    bus.declareQueue('q', { maxLength: 5 });
    bus.bind('ex', { queue: 'q', bindKey: 'a.#', headerArgs: [] });
    const snap = bus.snapshot();

    const bus2 = new BusTopology(new ManualBusClock2());
    bus2.restore(snap);
    expect(bus2.publish('ex', msg('a.b'))).toEqual(['q']);
  });

  it('queueSequence is a monotonic high watermark', () => {
    bus.declareExchange('ex', 'fanout');
    bus.declareQueue('q');
    bus.bind('ex', { queue: 'q', bindKey: '', headerArgs: [] });
    bus.publish('ex', msg('a'));
    bus.publish('ex', msg('b'));
    bus.dequeue('q', 1);
    expect(bus.queueSequence('q')).toBe(2);
  });
});
