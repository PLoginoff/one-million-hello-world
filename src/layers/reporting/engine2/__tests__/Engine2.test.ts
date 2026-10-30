/**
 * Tests for reporting engine2: ScheduledDelivery, ReportCache,
 * DrillNavigator, ExportFormatRegistry and ReportAccessControl.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ScheduledDelivery, GeneratedReport } from '../ScheduledDelivery';
import { ReportCache } from '../ReportCache';
import { DrillNavigator } from '../DrillDownNavigator';
import { ExportFormatRegistry } from '../ExportFormatRegistry';
import { MASK_VALUE, ReportAccessControl } from '../AccessPolicy';
import { DatasetProfiler } from '../DatasetProfiler';
import type { Dataset, ReportResult } from '../../reports/ReportTypes';

class FakeClock {
  t = 1_700_000_000_000;
  now(): number {
    return this.t;
  }
  advance(ms: number): void {
    this.t += ms;
  }
}

const MIN = 60_000;

function result(rows: Array<Record<string, string | number | boolean | Date | null>> = []): ReportResult {
  return { columns: rows.length ? Object.keys(rows[0]) : ['a'], rows, generatedAt: 1 };
}

function artifact(id: string, content = 'x'): GeneratedReport {
  return { scheduleId: id, generatedAt: 1, format: 'csv', content, rowCount: 1 };
}

describe('ScheduledDelivery', () => {
  let clock: FakeClock;
  let sd: ScheduledDelivery;
  const delivered: Array<{ ch: string; r: GeneratedReport }> = [];

  beforeEach(() => {
    clock = new FakeClock();
    delivered.length = 0;
    sd = new ScheduledDelivery({ clock });
    sd.registerChannel('email', (r) => {
      delivered.push({ ch: 'email', r });
    });
    sd.registerChannel('webhook', (r) => {
      delivered.push({ ch: 'webhook', r });
    });
  });

  it('delivers generated reports to all channels on due tick', async () => {
    sd.schedule({ scheduleId: 's1', cron: '* * * * *', format: 'csv', channels: ['email', 'webhook'], enabled: true });
    const recs = await sd.runDue(() => artifact('s1', 'data'), clock.now() + MIN);
    expect(recs).toHaveLength(2);
    expect(recs.every((r) => r.status === 'delivered')).toBe(true);
    expect(delivered).toHaveLength(2);
  });

  it('generate once, deliver many', async () => {
    let calls = 0;
    sd.schedule({ scheduleId: 's1', cron: '* * * * *', format: 'csv', channels: ['email', 'webhook'], enabled: true });
    await sd.runDue(() => {
      calls++;
      return artifact('s1');
    }, clock.now() + MIN);
    expect(calls).toBe(1);
  });

  it('catches up on every missed tick', async () => {
    sd.schedule({ scheduleId: 's1', cron: '* * * * *', format: 'csv', channels: ['email'], enabled: true });
    const recs = await sd.runDue(() => artifact('s1'), clock.now() + 3 * MIN + 1);
    expect(recs).toHaveLength(3);
  });

  it('records generation failure without blocking other jobs', async () => {
    sd.schedule({ scheduleId: 'bad', cron: '* * * * *', format: 'csv', channels: ['email'], enabled: true });
    sd.schedule({ scheduleId: 'good', cron: '* * * * *', format: 'csv', channels: ['email'], enabled: true });
    const recs = await sd.runDue((id) => {
      if (id === 'bad') throw new Error('dataset gone');
      return artifact(id);
    }, clock.now() + MIN);
    const bad = recs.find((r) => r.scheduleId === 'bad')!;
    expect(bad.status).toBe('generation-failed');
    expect(bad.error).toContain('dataset gone');
    expect(recs.find((r) => r.scheduleId === 'good')!.status).toBe('delivered');
  });

  it('isolates a failing channel from the others', async () => {
    sd.registerChannel('broken', () => {
      throw new Error('smtp down');
    });
    sd.schedule({ scheduleId: 's1', cron: '* * * * *', format: 'csv', channels: ['broken', 'email'], enabled: true });
    const recs = await sd.runDue(() => artifact('s1'), clock.now() + MIN);
    expect(recs[0].status).toBe('delivery-failed');
    expect(recs[1].status).toBe('delivered');
  });

  it('flags unknown channels as delivery failures', async () => {
    sd.schedule({ scheduleId: 's1', cron: '* * * * *', format: 'csv', channels: ['nope'], enabled: true });
    const recs = await sd.runDue(() => artifact('s1'), clock.now() + MIN);
    expect(recs[0].status).toBe('delivery-failed');
    expect(recs[0].error).toContain('nope');
  });

  it('disabled schedules do not fire until re-enabled', async () => {
    sd.schedule({ scheduleId: 's1', cron: '* * * * *', format: 'csv', channels: ['email'], enabled: false });
    expect(await sd.runDue(() => artifact('s1'), clock.now() + 10 * MIN)).toHaveLength(0);
    sd.setEnabled('s1', true);
    const recs = await sd.runDue(() => artifact('s1'), clock.now() + MIN);
    expect(recs).toHaveLength(1);
  });

  it('exposes bounded delivery history', async () => {
    sd.schedule({ scheduleId: 's1', cron: '* * * * *', format: 'csv', channels: ['email'], enabled: true });
    await sd.runDue(() => artifact('s1'), clock.now() + 2 * MIN);
    expect(sd.history('s1')).toHaveLength(2);
    expect(sd.history('other')).toHaveLength(0);
  });
});

describe('ReportCache', () => {
  let clock: FakeClock;
  let cache: ReportCache;

  beforeEach(() => {
    clock = new FakeClock();
    cache = new ReportCache({ clock, capacity: 3, defaultTtlMs: 60_000 });
  });

  it('hits within TTL and misses after expiry', () => {
    cache.set('q1', result([{ a: 1 }]));
    expect(cache.get('q1')).not.toBeNull();
    clock.advance(61_000);
    expect(cache.get('q1')).toBeNull();
    expect(cache.stats().misses).toBe(1);
  });

  it('getOrCompute computes once then serves warm', () => {
    let calls = 0;
    const r = cache.getOrCompute('k', () => {
      calls++;
      return result([{ a: 1 }]);
    });
    expect(r.rows).toHaveLength(1);
    cache.getOrCompute('k', () => {
      calls++;
      return result([]);
    });
    expect(calls).toBe(1);
  });

  it('evicts LRU when over capacity', () => {
    cache.set('a', result());
    cache.set('b', result());
    cache.set('c', result());
    cache.get('a'); // touch a → b becomes LRU
    cache.set('d', result());
    expect(cache.peek('b')).toBeNull();
    expect(cache.peek('a')).not.toBeNull();
    expect(cache.stats().evictions).toBe(1);
  });

  it('bulk-invalidates by tag', () => {
    cache.set('r1', result(), { tags: ['dataset:orders'] });
    cache.set('r2', result(), { tags: ['dataset:orders', 'daily'] });
    cache.set('r3', result(), { tags: ['dataset:users'] });
    expect(cache.invalidateTag('dataset:orders')).toBe(2);
    expect(cache.peek('r1')).toBeNull();
    expect(cache.peek('r3')).not.toBeNull();
  });

  it('prune reaps expired entries eagerly', () => {
    cache.set('a', result(), { ttlMs: 10 });
    clock.advance(20);
    expect(cache.prune()).toBe(1);
    expect(cache.stats().size).toBe(0);
  });

  it('fingerprint is key-order independent', () => {
    const a = ReportCache.fingerprint({ x: 1, y: { b: 2, a: 1 } });
    const b = ReportCache.fingerprint({ y: { a: 1, b: 2 }, x: 1 });
    expect(a).toBe(b);
  });

  it('rejects non-positive capacity', () => {
    expect(() => new ReportCache({ capacity: 0 })).toThrow();
  });
});

describe('DrillNavigator', () => {
  const spec = {
    name: 'sales',
    query: { dataset: 'orders', groupBy: ['region'] },
    drillPath: ['region', 'country', 'city'],
  };

  it('drills a row into the next dimension with additive filters', () => {
    const nav = new DrillNavigator(spec);
    const node = nav.drill({ region: 'EU' })!;
    expect(node.depth).toBe(1);
    expect(node.drilledOn).toBe('region');
    const q = nav.query();
    expect(q.filters).toEqual([{ column: 'region', op: 'eq', value: 'EU' }]);
    expect(q.groupBy).toEqual(['country']);
  });

  it('chains drills and accumulates filters', () => {
    const nav = new DrillNavigator(spec);
    nav.drill({ region: 'EU' });
    nav.drill({ country: 'DE' });
    const q = nav.query();
    expect(q.filters).toEqual([
      { column: 'region', op: 'eq', value: 'EU' },
      { column: 'country', op: 'eq', value: 'DE' },
    ]);
    expect(q.groupBy).toEqual(['city']);
    expect(nav.nextDimension()).toBe('city');
  });

  it('returns null at the leaf and stays put', () => {
    const nav = new DrillNavigator(spec);
    nav.drill({ region: 'EU' });
    nav.drill({ country: 'DE' });
    nav.drill({ city: 'Berlin' });
    expect(nav.nextDimension()).toBeNull();
    expect(nav.drill({ city: 'Berlin' })).toBeNull();
    expect(nav.current.depth).toBe(3);
  });

  it('up() and reset() restore earlier queries', () => {
    const nav = new DrillNavigator(spec);
    nav.drill({ region: 'EU' });
    nav.drill({ country: 'DE' });
    expect(nav.up()).toBe(true);
    expect(nav.query().filters).toHaveLength(1);
    nav.reset();
    expect(nav.query().filters).toBeUndefined();
    expect(nav.current.depth).toBe(0);
    expect(nav.up()).toBe(false);
  });

  it('renders breadcrumbs root→current', () => {
    const nav = new DrillNavigator(spec);
    nav.drill({ region: 'EU' });
    nav.drill({ country: 'DE' });
    expect(nav.crumbs().map((c) => c.label)).toEqual(['sales', 'region=EU', 'country=DE']);
  });

  it('throws when the row lacks the drill column', () => {
    const nav = new DrillNavigator(spec);
    expect(() => nav.drill({ other: 1 })).toThrow();
  });
});

describe('ExportFormatRegistry', () => {
  let clock: FakeClock;
  let reg: ExportFormatRegistry;

  beforeEach(() => {
    clock = new FakeClock();
    reg = new ExportFormatRegistry(() => clock.now());
  });

  const csvV1 = (r: ReportResult) => r.columns.join(',');
  const csvV2 = (r: ReportResult) => `v2:${r.columns.join(',')}`;

  it('exports the latest version by default', () => {
    reg.register('csv', 1, csvV1);
    reg.register('csv', 2, csvV2);
    expect(reg.export(result([{ a: 1 }]), 'csv')).toBe('v2:a');
  });

  it('pins older versions for compatibility', () => {
    reg.register('csv', 1, csvV1);
    reg.register('csv', 2, csvV2);
    expect(reg.export(result([{ a: 1 }]), 'csv', 1)).toBe('a');
  });

  it('formats are immutable — re-registering throws', () => {
    reg.register('csv', 1, csvV1);
    expect(() => reg.register('csv', 1, csvV2)).toThrow();
  });

  it('reports versions ascending and rejects unknowns', () => {
    reg.register('csv', 2, csvV2);
    reg.register('csv', 1, csvV1);
    expect(reg.versions('csv')).toEqual([1, 2]);
    expect(reg.latestVersion('csv')).toBe(2);
    expect(reg.latestVersion('pdf')).toBeNull();
    expect(() => reg.export(result(), 'pdf')).toThrow();
    expect(() => reg.export(result(), 'csv', 99)).toThrow();
  });

  it('keeps a per-format changelog', () => {
    reg.register('csv', 1, csvV1, { summary: 'initial' });
    reg.register('csv', 2, csvV2, { summary: 'added currency' });
    reg.register('json', 1, () => '{}');
    const log = reg.changelog('csv');
    expect(log.map((c) => c.summary)).toEqual(['initial', 'added currency']);
    expect(reg.changelog()).toHaveLength(3);
  });

  it('diffSchema flags breaking vs additive changes', () => {
    reg.register('csv', 1, csvV1, { columns: ['a', 'b'] });
    reg.register('csv', 2, csvV2, { columns: ['a', 'b', 'c'] });
    reg.register('csv', 3, csvV2, { columns: ['a', 'd'] });
    const additive = reg.diffSchema('csv', 1, 2);
    expect(additive.added).toEqual(['c']);
    expect(additive.backwardCompatible).toBe(true);
    const breaking = reg.diffSchema('csv', 1, 3);
    expect(breaking.removed).toEqual(['b']);
    expect(breaking.backwardCompatible).toBe(false);
  });
});

describe('ReportAccessControl', () => {
  let rac: ReportAccessControl;
  const alice = { userId: 'alice', roles: ['finance'] };
  const bob = { userId: 'bob', roles: ['support'] };
  const carol = { userId: 'carol', roles: [] };

  beforeEach(() => {
    rac = new ReportAccessControl(() => 42);
    rac.setPolicy({
      reportId: 'revenue',
      visibility: 'restricted',
      owner: 'alice',
      allowedRoles: ['finance'],
      allowedUsers: ['bob'],
      maskedColumns: ['ssn'],
      unmaskedFor: ['finance'],
      rowFilter: (row, p) => (p.roles.includes('finance') ? true : row.region === 'EU'),
    });
  });

  it('owner always allowed; public visible to all', () => {
    rac.setPolicy({ reportId: 'pub', visibility: 'public', owner: 'x' });
    expect(rac.decide('pub', carol).allowed).toBe(true);
    expect(rac.decide('revenue', alice).reason).toBe('owner');
  });

  it('restricted: role grant, direct user grant, deny otherwise', () => {
    expect(rac.decide('revenue', { userId: 'x', roles: ['finance'] }).allowed).toBe(true);
    expect(rac.decide('revenue', bob).allowed).toBe(true); // direct grant despite role
    expect(rac.decide('revenue', carol).allowed).toBe(false);
  });

  it('owner-only blocks everyone but the owner', () => {
    rac.setPolicy({ reportId: 'priv', visibility: 'owner-only', owner: 'alice' });
    expect(rac.decide('priv', alice).allowed).toBe(true);
    expect(rac.decide('priv', bob).allowed).toBe(false);
  });

  it('wildcard role grant admits any authenticated principal', () => {
    rac.setPolicy({ reportId: 'all', visibility: 'restricted', owner: 'x', allowedRoles: ['*'] });
    expect(rac.decide('all', carol).allowed).toBe(true);
  });

  it('filterResult masks privileged columns and filters rows', () => {
    const res: ReportResult = {
      columns: ['region', 'ssn'],
      rows: [
        { region: 'EU', ssn: '111' },
        { region: 'US', ssn: '222' },
      ],
      generatedAt: 0,
    };
    // Bob: no finance role → masked + only EU rows.
    const bobView = rac.filterResult('revenue', bob, res)!;
    expect(bobView.rows).toHaveLength(1);
    expect(bobView.rows[0].ssn).toBe(MASK_VALUE);
    // Alice (finance+owner): unmasked, all rows.
    const aliceView = rac.filterResult('revenue', alice, res)!;
    expect(aliceView.rows).toHaveLength(2);
    expect(aliceView.rows[1].ssn).toBe('222');
  });

  it('denied principals get null', () => {
    expect(rac.filterResult('revenue', carol, result())).toBeNull();
  });

  it('records decisions in the audit log', () => {
    rac.decide('revenue', bob);
    rac.decide('revenue', carol);
    const log = rac.decisionLog();
    expect(log).toHaveLength(2);
    expect(log[0].allowed).toBe(true);
    expect(log[1].allowed).toBe(false);
  });
});

describe('DatasetProfiler', () => {
  const profiler = new DatasetProfiler({ topK: 3 });

  function ds(rows: Array<Record<string, string | number | null>>): Dataset {
    return {
      name: 'orders',
      columns: [
        { name: 'region', type: 'string' },
        { name: 'amount', type: 'number' },
        { name: 'note', type: 'string' },
      ],
      rows,
    };
  }

  it('computes null rate, distinct count and numeric moments', () => {
    const p = profiler.profile(
      ds([
        { region: 'EU', amount: 10, note: null },
        { region: 'EU', amount: 20, note: 'x' },
        { region: 'US', amount: 30, note: null },
        { region: 'US', amount: 40, note: null },
      ])
    );
    expect(p.rows).toBe(4);
    const region = p.columns.find((c) => c.name === 'region')!;
    expect(region.distinct).toBe(2);
    expect(region.distinctEstimated).toBe(false);
    const amount = p.columns.find((c) => c.name === 'amount')!;
    expect(amount.min).toBe(10);
    expect(amount.max).toBe(40);
    expect(amount.mean).toBe(25);
    const note = p.columns.find((c) => c.name === 'note')!;
    expect(note.nullRate).toBeCloseTo(0.75, 5);
  });

  it('top-k via space-saving surfaces dominant values', () => {
    const rows = [];
    for (let i = 0; i < 100; i++) rows.push({ region: 'EU', amount: 1, note: 'a' });
    for (let i = 0; i < 60; i++) rows.push({ region: 'US', amount: 1, note: 'b' });
    for (let i = 0; i < 10; i++) rows.push({ region: 'APAC', amount: 1, note: 'c' });
    const p = profiler.profile(ds(rows));
    const region = p.columns.find((c) => c.name === 'region')!;
    expect(region.top[0].value).toBe('EU');
    expect(region.top[0].count).toBeGreaterThanOrEqual(90); // space-saving under-counts slightly
    expect(region.top).toHaveLength(3);
  });

  it('HLL estimates distinct for large cardinalities', () => {
    const p2 = new DatasetProfiler({ exactDistinctBelow: 10, topK: 5 });
    const rows = [];
    for (let i = 0; i < 1000; i++) rows.push({ region: `r-${i}`, amount: 1, note: 'x' });
    const prof = p2.profile(ds(rows));
    const region = prof.columns.find((c) => c.name === 'region')!;
    expect(region.distinctEstimated).toBe(true);
    // HLL ±few %: true count is 1000.
    expect(region.distinct).toBeGreaterThan(700);
    expect(region.distinct).toBeLessThan(1300);
  });

  it('suggestDrillPath prefers low-cardinality columns', () => {
    const p = profiler.profile(
      ds([
        { region: 'EU', amount: 1, note: 'unique-1' },
        { region: 'US', amount: 2, note: 'unique-2' },
        { region: 'EU', amount: 3, note: 'unique-3' },
      ])
    );
    const path = profiler.suggestDrillPath(p);
    expect(path).toContain('region');
    expect(path).not.toContain('note'); // ~100% cardinality
  });
});
