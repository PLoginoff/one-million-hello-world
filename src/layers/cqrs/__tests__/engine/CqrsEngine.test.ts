/**
 * CQRS engine tests: read-model store + indexes + checkpoints, lag monitor
 * with hysteresis, query routing with staleness guard, parallel rebuilds,
 * parent-child assembly.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ManualClock } from '../../../observability/engine/signals';
import { ProjectionEvent } from '../../implementations/Denormalizer';
import {
  ReadModelStore,
  ConsistencyMonitor,
  QueryRouter,
  RebuildOrchestrator,
  RebuildableProjection,
  MonitorAlert,
  StaleReadError,
  UnknownQueryError,
  joinChildren,
  joinChildrenMany,
  embedChild,
  removeEmbeddedChild,
  patchEmbeddedChild,
  groupChildren,
} from '../../engine';

const ev = (
  type: string,
  position: number,
  data: Record<string, unknown> = {},
  aggregateId = 'a1'
): ProjectionEvent => ({
  eventId: `e${position}`,
  type,
  aggregateId,
  aggregateVersion: position + 1,
  position,
  data,
  metadata: {},
  timestamp: 0,
});

describe('ReadModelStore', () => {
  let store: ReadModelStore;

  beforeEach(() => {
    store = new ReadModelStore();
    store.registerModel({ name: 'orders', indexes: ['customerId'] });
  });

  it('upserts and reads documents', () => {
    store.upsert('orders', 'o1', { id: 'o1', customerId: 'c1', total: 100 });
    expect(store.get('orders', 'o1')!.total).toBe(100);
  });

  it('findBy uses the secondary index in O(1)', () => {
    store.upsert('orders', 'o1', { id: 'o1', customerId: 'c1' });
    store.upsert('orders', 'o2', { id: 'o2', customerId: 'c1' });
    store.upsert('orders', 'o3', { id: 'o3', customerId: 'c2' });
    expect(store.findBy('orders', 'customerId', 'c1')).toHaveLength(2);
    expect(store.findBy('orders', 'customerId', 'c9')).toHaveLength(0);
  });

  it('keeps the index consistent when a doc changes key', () => {
    store.upsert('orders', 'o1', { id: 'o1', customerId: 'c1' });
    store.upsert('orders', 'o1', { id: 'o1', customerId: 'c2' });
    expect(store.findBy('orders', 'customerId', 'c1')).toHaveLength(0);
    expect(store.findBy('orders', 'customerId', 'c2')).toHaveLength(1);
  });

  it('applyBatch applies ops and advances the checkpoint atomically', () => {
    store.applyBatch('orders-proj', 10, 'orders', [
      { kind: 'upsert', id: 'o1', document: { id: 'o1', customerId: 'c1' } },
      { kind: 'patch', id: 'o1', patch: { status: 'paid' } },
    ]);
    expect(store.get('orders', 'o1')!.status).toBe('paid');
    expect(store.checkpoint('orders-proj')).toBe(10);
  });

  it('checkpoint never moves backwards', () => {
    store.applyBatch('p', 10, 'orders', []);
    store.applyBatch('p', 5, 'orders', []);
    expect(store.checkpoint('p')).toBe(10);
  });

  it('prepareRebuild clears model AND checkpoint', () => {
    store.upsert('orders', 'o1', { id: 'o1' });
    store.setCheckpoint('p', 42);
    store.prepareRebuild('p', 'orders');
    expect(store.count('orders')).toBe(0);
    expect(store.checkpoint('p')).toBe(-1);
  });

  it('findBy throws on a non-indexed field', () => {
    expect(() => store.findBy('orders', 'status', 'x')).toThrow();
  });
});

describe('ConsistencyMonitor', () => {
  let clock: ManualClock;
  let store: ReadModelStore;
  let head: number;
  let alerts: MonitorAlert[];
  let monitor: ConsistencyMonitor;

  beforeEach(() => {
    clock = new ManualClock(1000);
    store = new ReadModelStore();
    head = 0;
    alerts = [];
    monitor = new ConsistencyMonitor(store, () => head, {
      thresholds: { orders: { warnLag: 10, critLag: 50 } },
      defaultThresholds: { warnLag: 5, critLag: 20 },
      minDurationMs: 0,
    });
    monitor.onAlert((a) => alerts.push(a));
  });

  it('alerts on warn then crit as lag grows', () => {
    store.setCheckpoint('orders', 0);
    head = 15;
    monitor.check();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].to).toBe('warn');

    head = 60;
    monitor.check();
    expect(alerts).toHaveLength(2);
    expect(alerts[1].to).toBe('crit');
  });

  it('does not re-alert while a level holds', () => {
    store.setCheckpoint('orders', 0);
    head = 60;
    monitor.check();
    monitor.check();
    monitor.check();
    expect(alerts).toHaveLength(1);
  });

  it('alerts on recovery', () => {
    store.setCheckpoint('orders', 0);
    head = 60;
    monitor.check();
    store.setCheckpoint('orders', 60);
    monitor.check();
    expect(alerts[1].to).toBe('ok');
    expect(alerts[1].from).toBe('crit');
  });

  it('respects minDurationMs before the first alert', () => {
    const m2 = new ConsistencyMonitor(store, () => head, {
      thresholds: { orders: { warnLag: 10, critLag: 50 } },
      minDurationMs: 5000,
    }, clock);
    const a2: MonitorAlert[] = [];
    m2.onAlert((a) => a2.push(a));

    store.setCheckpoint('orders', 0);
    head = 20;
    m2.check();
    expect(a2).toHaveLength(0); // just entered, pending

    clock.advance(3000);
    m2.check();
    expect(a2).toHaveLength(0); // still pending

    clock.advance(3000); // total 6s > 5s
    m2.check();
    expect(a2).toHaveLength(1);
    expect(a2[0].to).toBe('warn');
  });

  it('cancels the pending alert if lag recovers during the window', () => {
    const m2 = new ConsistencyMonitor(store, () => head, {
      thresholds: { orders: { warnLag: 10, critLag: 50 } },
      minDurationMs: 5000,
    }, clock);
    const a2: MonitorAlert[] = [];
    m2.onAlert((a) => a2.push(a));

    store.setCheckpoint('orders', 0);
    head = 20;
    m2.check();
    clock.advance(2000);
    store.setCheckpoint('orders', 20); // caught up
    m2.check();
    clock.advance(10_000);
    m2.check();
    expect(a2).toHaveLength(0);
  });

  it('status() reports level and lag per projection', () => {
    store.setCheckpoint('orders', 0);
    head = 60;
    monitor.check();
    const st = monitor.status();
    expect(st.orders.level).toBe('crit');
    expect(st.orders.lag).toBe(60);
  });
});

describe('QueryRouter', () => {
  let store: ReadModelStore;
  let head: number;
  let router: QueryRouter;

  beforeEach(() => {
    store = new ReadModelStore();
    store.registerModel({ name: 'orders', indexes: ['customerId'] });
    head = 0;
    router = new QueryRouter(store, () => head);
  });

  it('routes a query to its read model', async () => {
    store.upsert('orders', 'o1', { id: 'o1', customerId: 'c1' });
    router.register('GetOrdersByCustomer', {
      model: 'orders',
      run: (q, s) => s.findBy('orders', 'customerId', q.params.customerId),
    });
    const res = await router.dispatch({ type: 'GetOrdersByCustomer', params: { customerId: 'c1' } });
    expect(res).toHaveLength(1);
  });

  it('throws UnknownQueryError for unregistered types', async () => {
    await expect(router.dispatch({ type: 'Nope', params: {} })).rejects.toThrow(UnknownQueryError);
  });

  it('refuses stale reads when maxLagEvents is exceeded', async () => {
    router.register('GetOrder', {
      model: 'orders',
      maxLagEvents: 10,
      run: (q, s) => s.get('orders', q.params.id as string),
    });
    head = 100; // checkpoint is -1 → lag 101
    await expect(
      router.dispatch({ type: 'GetOrder', params: { id: 'o1' } })
    ).rejects.toThrow(StaleReadError);
  });

  it('serves when lag is within bounds', async () => {
    store.upsert('orders', 'o1', { id: 'o1', customerId: 'c1' });
    store.setCheckpoint('orders', 95);
    head = 100;
    router.register('GetOrder', {
      model: 'orders',
      projection: 'orders',
      maxLagEvents: 10,
      run: (q, s) => s.get('orders', q.params.id as string),
    });
    const res = await router.dispatch<{ id: string }, { id: string } | undefined>({
      type: 'GetOrder',
      params: { id: 'o1' },
    });
    expect(res!.id).toBe('o1');
  });

  it('uses the fallback when the primary read misses', async () => {
    router.register('GetOrder', {
      model: 'orders',
      run: (q, s) => s.get('orders', q.params.id as string),
      fallback: () => ({ id: 'fallback-result' }),
    });
    const res = await router.dispatch<{ id: string }, { id: string }>({
      type: 'GetOrder',
      params: { id: 'ghost' },
    });
    expect(res.id).toBe('fallback-result');
  });
});

describe('RebuildOrchestrator', () => {
  let store: ReadModelStore;

  beforeEach(() => {
    store = new ReadModelStore();
    store.registerModel({ name: 'orders' });
    store.registerModel({ name: 'customers' });
  });

  const orderProjection: RebuildableProjection = {
    name: 'orders-proj',
    model: 'orders',
    eventTypes: ['OrderPlaced'],
    project: (e) => {
      const d = e.data as { orderId: string; total: number };
      return [{ kind: 'upsert', id: d.orderId, document: { id: d.orderId, total: d.total } }];
    },
  };

  it('rebuilds a model from the event log and sets the checkpoint', async () => {
    const orch = new RebuildOrchestrator(store);
    const events = [
      ev('OrderPlaced', 0, { orderId: 'o1', total: 10 }),
      ev('OrderPlaced', 1, { orderId: 'o2', total: 20 }),
      ev('OtherEvent', 2),
      ev('OrderPlaced', 3, { orderId: 'o3', total: 30 }),
    ];
    const r = await orch.rebuild(orderProjection, events);
    expect(r.eventsScanned).toBe(4);
    expect(r.eventsApplied).toBe(3);
    expect(r.opsWritten).toBe(3);
    expect(r.finalCheckpoint).toBe(3);
    expect(store.count('orders')).toBe(3);
    expect(store.checkpoint('orders-proj')).toBe(3);
  });

  it('clears stale documents before rebuild', async () => {
    store.upsert('orders', 'stale', { id: 'stale' });
    const orch = new RebuildOrchestrator(store);
    await orch.rebuild(orderProjection, [ev('OrderPlaced', 0, { orderId: 'o1', total: 1 })]);
    expect(store.get('orders', 'stale')).toBeUndefined();
  });

  it('reports per-batch progress', async () => {
    const orch = new RebuildOrchestrator(store);
    const events = Array.from({ length: 25 }, (_, i) =>
      ev('OrderPlaced', i, { orderId: `o${i}`, total: i })
    );
    const ticks: number[] = [];
    await orch.rebuild(orderProjection, events, {
      batchSize: 10,
      onProgress: (p) => ticks.push(p.eventsDone),
    });
    expect(ticks).toEqual([10, 20, 25]);
  });

  it('collects projection errors without aborting the rebuild', async () => {
    const bad: RebuildableProjection = {
      name: 'bad-proj',
      model: 'orders',
      eventTypes: ['OrderPlaced'],
      project: (e) => {
        if (e.position === 1) throw new Error('boom');
        const d = e.data as { orderId: string };
        return [{ kind: 'upsert', id: d.orderId, document: { id: d.orderId } }];
      },
    };
    const orch = new RebuildOrchestrator(store);
    const r = await orch.rebuild(bad, [
      ev('OrderPlaced', 0, { orderId: 'a' }),
      ev('OrderPlaced', 1, { orderId: 'b' }),
      ev('OrderPlaced', 2, { orderId: 'c' }),
    ]);
    expect(r.errors).toHaveLength(1);
    expect(store.count('orders')).toBe(2); // a + c applied, b skipped
  });

  it('rebuilds multiple projections in parallel', async () => {
    const orch = new RebuildOrchestrator(store);
    const custProj: RebuildableProjection = {
      name: 'customers-proj',
      model: 'customers',
      eventTypes: ['CustomerCreated'],
      project: (e) => {
        const d = e.data as { customerId: string };
        return [{ kind: 'upsert', id: d.customerId, document: { id: d.customerId } }];
      },
    };
    const events = [
      ev('OrderPlaced', 0, { orderId: 'o1', total: 5 }),
      ev('CustomerCreated', 1, { customerId: 'c1' }),
      ev('OrderPlaced', 2, { orderId: 'o2', total: 7 }),
      ev('CustomerCreated', 3, { customerId: 'c2' }),
    ];
    const results = await orch.rebuildAll([orderProjection, custProj], events, { concurrency: 2 });
    expect(results).toHaveLength(2);
    expect(store.count('orders')).toBe(2);
    expect(store.count('customers')).toBe(2);
    expect(store.checkpoint('orders-proj')).toBe(2);
    expect(store.checkpoint('customers-proj')).toBe(3);
  });
});

describe('Assembly helpers', () => {
  let store: ReadModelStore;

  beforeEach(() => {
    store = new ReadModelStore();
    store.registerModel({ name: 'order-lines', indexes: ['orderId'] });
    store.registerModel({ name: 'shipments', indexes: ['orderId'] });
  });

  it('joinChildren attaches children via indexed FKs', () => {
    store.upsert('order-lines', 'l1', { id: 'l1', orderId: 'o1', sku: 'A' });
    store.upsert('order-lines', 'l2', { id: 'l2', orderId: 'o1', sku: 'B' });
    store.upsert('order-lines', 'l3', { id: 'l3', orderId: 'o2', sku: 'C' });
    store.upsert('shipments', 's1', { id: 's1', orderId: 'o1' });

    const order = { id: 'o1', total: 50 };
    const out = joinChildren(store, order, [
      { model: 'order-lines', foreignKey: 'orderId', as: 'lines' },
      { model: 'shipments', foreignKey: 'orderId', as: 'shipments' },
    ]);
    expect(out.lines).toHaveLength(2);
    expect(out.shipments).toHaveLength(1);
    expect(out.total).toBe(50);
    // Parent doc in store untouched (out is a copy).
    expect(order.lines).toBeUndefined();
  });

  it('joinChildrenMany applies to a list', () => {
    store.upsert('order-lines', 'l1', { id: 'l1', orderId: 'o1' });
    const out = joinChildrenMany(store, [{ id: 'o1' }, { id: 'o2' }], [
      { model: 'order-lines', foreignKey: 'orderId', as: 'lines' },
    ]);
    expect(out[0].lines).toHaveLength(1);
    expect(out[1].lines).toHaveLength(0);
  });

  it('embedChild upserts a child and syncs the counter', () => {
    let order = { id: 'o1', lines: [] };
    order = embedChild(order, { as: 'lines', countField: 'lineCount' }, { id: 'l1', qty: 1 });
    order = embedChild(order, { as: 'lines', countField: 'lineCount' }, { id: 'l2', qty: 2 });
    expect(order.lineCount).toBe(2);
    // Upsert same id → replace, not duplicate.
    order = embedChild(order, { as: 'lines', countField: 'lineCount' }, { id: 'l1', qty: 9 });
    expect(order.lineCount).toBe(2);
    expect((order.lines as { qty: number }[])[0].qty).toBe(9);
  });

  it('removeEmbeddedChild and patchEmbeddedChild', () => {
    let order = { id: 'o1', lines: [{ id: 'l1', qty: 1 }, { id: 'l2', qty: 2 }] };
    order = patchEmbeddedChild(order, { as: 'lines' }, 'l1', { qty: 5 });
    expect((order.lines as { qty: number }[])[0].qty).toBe(5);
    order = removeEmbeddedChild(order, { as: 'lines' }, 'l2');
    expect(order.lines).toHaveLength(1);
  });

  it('groupChildren folds flat join rows into trees', () => {
    const rows = [
      { parent: { id: 'o1', total: 10 }, child: { id: 'l1' } },
      { parent: { id: 'o1', total: 10 }, child: { id: 'l2' } },
      { parent: { id: 'o2', total: 20 }, child: null },
    ];
    const out = groupChildren(rows, 'lines');
    expect(out).toHaveLength(2);
    expect(out[0].lines).toHaveLength(2);
    expect(out[1].lines).toHaveLength(0);
  });
});
