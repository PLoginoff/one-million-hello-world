/**
 * Sharding Engine tests
 *
 * Covers: consistent-hash routing + ownership balance, scatter/gather fan-out
 * with sorted k-way merge and shard pruning, read/write splitting with
 * lag-aware replica selection, exponential-backoff retry with jitter and
 * error classification, EXPLAIN-style plan diagnostics (full-scan detection),
 * and field-level PII masking per role.
 */

import { describe, it, expect, beforeEach } from 'bun:test';

import {
  Spec,
  ConnectionRetrier,
  CrossShardQuery,
  DataMasker,
  MapStore,
  NoFreshReplicaError,
  QueryPlanAnalyzer,
  ReplicaSet,
  RetryableConnectionError,
  RetryExhaustedError,
  ShardKeyError,
  ShardRouter,
  ShardRebalancer,
  ShardTopology,
  ShardingEngine,
  fnv1a,
} from '../../engine';

interface Row {
  id: string;
  tenantId: string;
  name: string;
  age: number;
  email: string;
  ssn: string;
  dob: Date;
}

const row = (id: string, tenant: string, over: Partial<Row> = {}): Row => ({
  id,
  tenantId: tenant,
  name: over.name ?? `n-${id}`,
  age: over.age ?? 30,
  email: over.email ?? `${id}@x.com`,
  ssn: over.ssn ?? `123-45-${id.padStart(4, '0')}`,
  dob: over.dob ?? new Date('1990-06-15'),
  ...over,
});

const mkRouter = (n = 4) => {
  const r = new ShardRouter<Row>({ shardKeyField: 'tenantId', vnodesPerShard: 64 });
  for (let i = 0; i < n; i++) r.addShard(`s${i}`, new MapStore<Row>());
  return r;
};

// --------------------------------------------------------------------------

describe('ShardRouter — consistent hashing', () => {
  it('routes the same key to the same shard deterministically', () => {
    const r = mkRouter();
    const a = r.shardForKey('tenant-42').name;
    expect(r.shardForKey('tenant-42').name).toBe(a);
    expect(mkRouter().shardForKey('tenant-42').name).toBe(a); // same ring
  });

  it('extracts the shard key from a row field', () => {
    const r = mkRouter();
    const s = r.shardFor(row('1', 'acme'));
    expect(s.name).toBe(r.shardForKey('acme').name);
  });

  it('throws when the shard key field is missing', () => {
    const r = mkRouter();
    expect(() => r.shardFor({ id: 'x' } as Row)).toThrow(ShardKeyError);
  });

  it('keeps ownership roughly balanced across shards', () => {
    const r = mkRouter(6);
    const report = r.ownershipReport();
    expect(report.size).toBe(6);
    for (const [, share] of report) {
      // With 64 vnodes/shard each share should be within ~10–25% of ideal.
      expect(share).toBeGreaterThan(0.05);
      expect(share).toBeLessThan(0.45);
    }
    const total = [...report.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it('remaps only a small fraction of keys when a shard is added', () => {
    const r = mkRouter(4);
    const before = new Map<string, string>();
    for (let i = 0; i < 500; i++) {
      before.set(`k${i}`, r.shardForKey(`k${i}`).name);
    }
    r.addShard('s4', new MapStore<Row>());
    let moved = 0;
    for (let i = 0; i < 500; i++) {
      if (r.shardForKey(`k${i}`).name !== before.get(`k${i}`)) moved++;
    }
    // Ideal is 20% (1/5 of keys move); consistent hashing should be well
    // under the ~75% that modulo routing would remap.
    expect(moved / 500).toBeLessThan(0.5);
    expect(moved).toBeGreaterThan(0);
  });

  it('fnv1a is deterministic and well-distributed', () => {
    expect(fnv1a('a')).toBe(fnv1a('a'));
    expect(fnv1a('a')).not.toBe(fnv1a('b'));
  });
});

// --------------------------------------------------------------------------

describe('CrossShardQuery — fan-out', () => {
  let router: ShardRouter<Row>;
  let q: CrossShardQuery<Row>;

  beforeEach(() => {
    router = mkRouter(4);
    q = new CrossShardQuery(router);
    for (let i = 0; i < 40; i++) {
      q.insert(row(`id${i}`, `t${i % 4}`, { age: 20 + (i % 30) }));
    }
  });

  it('scatters to all shards and gathers every matching row', () => {
    const res = q.query(Spec.field('age').gte(40).node);
    const ages = res.page.rows.map((r) => r.row.age);
    expect(ages.every((a) => a >= 40)).toBe(true);
    // ~10 rows of the 40 have age >= 40 (ages 40–49 for i%30 in 20..29).
    expect(res.page.rows.length).toBe(10);
  });

  it('k-way merge returns globally sorted output across shards', () => {
    const res = q.query(Spec.all().node, [{ field: 'age', dir: 'asc' }]);
    const ages = res.page.rows.map((r) => r.row.age);
    const sorted = [...ages].sort((a, b) => a - b);
    expect(ages).toEqual(sorted);
  });

  it('paginates with keyset cursors across shards', () => {
    const sort = [{ field: 'age', dir: 'asc' as const }, { field: 'id', dir: 'asc' as const }];
    const p1 = q.query(Spec.all().node, sort, { first: 10 });
    expect(p1.page.rows.length).toBe(10);
    expect(p1.page.pageInfo.hasNextPage).toBe(true);
    const after = p1.page.pageInfo.endCursor as string;
    const p2 = q.query(Spec.all().node, sort, { first: 10, after });
    const a1 = p1.page.rows.map((r) => r.row.id);
    const a2 = p2.page.rows.map((r) => r.row.id);
    expect(a1.every((id) => !a2.includes(id))).toBe(true); // no overlap
  });

  it('prunes to a single shard when the spec pins the shard key', () => {
    const planner = new QueryPlanAnalyzer();
    const keys = planner.pruneShards(Spec.field('tenantId').eq('t1').node, 'tenantId');
    expect(keys).toEqual(['t1']);
    // AND keeps pruning when one conjunct pins the key.
    const andKeys = planner.pruneShards(
      Spec.and(Spec.field('age').gt(10), Spec.field('tenantId').eq('t1')).node,
      'tenantId'
    );
    expect(andKeys).toEqual(['t1']);
    // A non-shard-key spec can't prune.
    expect(planner.pruneShards(Spec.field('age').eq(5).node, 'tenantId')).toBeNull();
  });

  it('counts across shards without materializing pages', () => {
    expect(q.count(Spec.all().node)).toBe(40);
  });
});

// --------------------------------------------------------------------------

describe('ReplicaSet — read/write splitting', () => {
  it('routes writes to primary only; reads to freshest in-budget replica', () => {
    const primary = new MapStore<Row>();
    const rs = new ReplicaSet<Row>(primary);
    const r1 = rs.addReplica('r1', new MapStore<Row>());
    const r2 = rs.addReplica('r2', new MapStore<Row>());
    r1.lagMs = 50;
    r2.lagMs = 10;

    // Freshness budget 100ms → both qualify; r2 is fresher → wins.
    const route = rs.route(100);
    expect(route.servedBy).toBe('r2');
    expect(route.lagMs).toBe(10);
  });

  it('falls back to primary when no replica meets the freshness budget', () => {
    const rs = new ReplicaSet<Row>(new MapStore<Row>());
    const r1 = rs.addReplica('r1', new MapStore<Row>());
    r1.lagMs = 5_000;
    const route = rs.route(1_000);
    expect(route.servedBy).toBe('primary');
    expect(route.fellBackToPrimary).toBe(true);
  });

  it('throws NoFreshReplicaError when fallback is disallowed', () => {
    const rs = new ReplicaSet<Row>(new MapStore<Row>());
    rs.addReplica('r1', new MapStore<Row>()).lagMs = 9_999;
    expect(() => rs.route(100, false)).toThrow(NoFreshReplicaError);
  });

  it('skips unhealthy replicas in routing', () => {
    const rs = new ReplicaSet<Row>(new MapStore<Row>());
    const r1 = rs.addReplica('r1', new MapStore<Row>());
    const r2 = rs.addReplica('r2', new MapStore<Row>());
    r1.lagMs = 1;
    r2.lagMs = 2;
    rs.markUnhealthy('r1');
    expect(rs.route(100).servedBy).toBe('r2');
  });

  it('maxLagMs=0 always reads from primary (strong consistency)', () => {
    const rs = new ReplicaSet<Row>(new MapStore<Row>());
    rs.addReplica('r1', new MapStore<Row>()).lagMs = 0;
    expect(rs.route(0).servedBy).toBe('primary');
  });
});

// --------------------------------------------------------------------------

describe('ConnectionRetrier — backoff + classification', () => {
  it('retries transient failures until success', async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const r = new ConnectionRetrier({
      maxAttempts: 4,
      jitter: 'none',
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
    });
    const out = await r.run(() => {
      calls++;
      if (calls < 3) throw new RetryableConnectionError('ECONNRESET');
      return 'ok';
    });
    expect(out).toBe('ok');
    expect(calls).toBe(3);
    expect(sleeps.length).toBe(2);
  });

  it('rethrows permanent errors immediately without retry', async () => {
    let calls = 0;
    const r = new ConnectionRetrier({ sleep: () => Promise.resolve() });
    await expect(
      r.run(() => {
        calls++;
        throw new Error('duplicate key value violates unique constraint');
      })
    ).rejects.toThrow('duplicate key');
    expect(calls).toBe(1);
  });

  it('exhausts attempts and throws RetryExhaustedError', async () => {
    const r = new ConnectionRetrier({ maxAttempts: 3, sleep: () => Promise.resolve() });
    await expect(
      r.run(() => {
        throw new RetryableConnectionError('timeout');
      })
    ).rejects.toThrow(RetryExhaustedError);
  });

  it('delayFor grows exponentially and caps at maxDelayMs', () => {
    const r = new ConnectionRetrier({
      baseDelayMs: 100,
      factor: 2,
      maxDelayMs: 500,
      jitter: 'none',
    });
    expect(r.delayFor(1)).toBe(100);
    expect(r.delayFor(2)).toBe(200);
    expect(r.delayFor(3)).toBe(400);
    expect(r.delayFor(4)).toBe(500); // capped
  });

  it('full jitter keeps delays within [0, computed]', () => {
    const r = new ConnectionRetrier({ baseDelayMs: 100, jitter: 'full', random: () => 0.5 });
    expect(r.delayFor(2)).toBe(100); // 0.5 × 200
  });
});

// --------------------------------------------------------------------------

describe('QueryPlanAnalyzer — EXPLAIN', () => {
  const stats = { rowCount: 50_000, cardinality: { tenantId: 4, email: 50_000 } };

  it('flags a full scan on a large table as critical', () => {
    const p = new QueryPlanAnalyzer();
    const report = p.analyze(Spec.field('age').gt(40).node, [], [], stats);
    expect(report.root.kind === 'full-scan' || report.root.kind === 'sort').toBe(true);
    expect(report.diagnostics.some((d) => d.code === 'FULL_SCAN_LARGE_TABLE')).toBe(true);
    expect(report.ok).toBe(false);
  });

  it('recommends index-lookup for equality on an indexed field', () => {
    const p = new QueryPlanAnalyzer();
    const report = p.analyze(Spec.field('email').eq('a@b.c').node, [], ['email'], stats);
    expect(report.root.kind).toBe('index-lookup');
    expect(report.ok).toBe(true);
  });

  it('warns on a selective filter with no index', () => {
    const p = new QueryPlanAnalyzer();
    const report = p.analyze(Spec.field('email').eq('a@b.c').node, [], [], stats);
    expect(report.diagnostics.some((d) => d.code === 'MISSING_INDEX')).toBe(true);
  });

  it('flags an unindexed sort over many rows', () => {
    const p = new QueryPlanAnalyzer();
    const report = p.analyze(
      Spec.all().node,
      [{ field: 'age', dir: 'desc' }],
      [],
      stats
    );
    expect(report.diagnostics.some((d) => d.code === 'SORT_NO_INDEX')).toBe(true);
  });
});

// --------------------------------------------------------------------------

describe('DataMasker — PII on read', () => {
  const masker = new DataMasker({
    rules: [
      { field: 'ssn', mask: 'partial' },
      { field: 'email', mask: 'hash' },
      { field: 'name', mask: 'redact' },
      { field: 'dob', mask: 'year' },
    ],
    bypassRoles: ['admin'],
    roleExemptions: { support: ['email'] },
  });

  it('applies per-kind masks deterministically', () => {
    const m = masker.maskRow(row('7', 't', { ssn: '123-45-6789' }));
    expect(m.name).toBe('***');
    expect(m.ssn.endsWith('6789')).toBe(true);
    expect(m.ssn.startsWith('123')).toBe(false);
    expect(m.email.startsWith('h:')).toBe(true);
    expect(m.dob.getUTCMonth()).toBe(0);
    expect(m.dob.getUTCDate()).toBe(1);
  });

  it('is deterministic — same input → same masked output', () => {
    const a = masker.maskRow(row('7', 't'));
    const b = masker.maskRow(row('7', 't'));
    expect(a.email).toBe(b.email);
    expect(a.ssn).toBe(b.ssn);
  });

  it('bypass role sees raw data', () => {
    const raw = row('7', 't');
    const m = masker.maskRow(raw, 'admin');
    expect(m.name).toBe(raw.name);
    expect(m.ssn).toBe(raw.ssn);
  });

  it('role exemptions unmask specific fields only', () => {
    const m = masker.maskRow(row('7', 't'), 'support');
    expect(m.email).toBe('7@x.com'); // exempt
    expect(m.name).toBe('***'); // still masked
  });

  it('does not mutate the source row', () => {
    const raw = row('7', 't');
    const ssn = raw.ssn;
    masker.maskRow(raw);
    expect(raw.ssn).toBe(ssn);
  });
});

// --------------------------------------------------------------------------

describe('ShardRebalancer — post-scale migration', () => {
  const mk = () => {
    const r = new ShardRouter<Row>({ shardKeyField: 'tenantId', vnodesPerShard: 64 });
    for (let i = 0; i < 3; i++) r.addShard(`s${i}`, new MapStore<Row>());
    return r;
  };

  it('plans and executes a migration after adding a shard', () => {
    const r = mk();
    // Seed rows across the 3-shard ring with distinct keys.
    for (let i = 0; i < 300; i++) {
      const row_ = row(`id${i}`, `t${i}`);
      r.shardFor(row_).store.insert(row_);
    }
    const totalBefore = r
      .shardNames()
      .reduce((n, s) => n + r.shardNamed(s).store.size(), 0);
    expect(totalBefore).toBe(300);

    // Add a shard — the ring remaps ~25% of keys.
    r.addShard('s3', new MapStore<Row>());
    const rebal = new ShardRebalancer<Row>(r, { shardKey: (x) => x.tenantId });
    const plan = rebal.plan();
    expect(plan.tasks.length).toBeGreaterThan(0);
    expect(plan.tasks.length).toBeLessThan(300); // not everything moves

    const progress = rebal.execute(plan, 10);
    expect(progress.done).toBe(true);
    expect(progress.moved).toBe(plan.tasks.length);

    // Every row now lives on its routed shard.
    let misplaced = 0;
    for (const name of r.shardNames()) {
      for (const rw of r.shardNamed(name).store.scan(() => true)) {
        if (r.shardFor(rw).name !== name) misplaced++;
      }
    }
    expect(misplaced).toBe(0);
    // Nothing lost.
    const totalAfter = r
      .shardNames()
      .reduce((n, s) => n + r.shardNamed(s).store.size(), 0);
    expect(totalAfter).toBe(300);
  });
});

describe('ShardTopology — versioning + zone routing', () => {
  it('bumps generation on topology changes', () => {
    const r = new ShardRouter<Row>({ shardKeyField: 'tenantId' });
    const topo = new ShardTopology<Row>(r, []);
    expect(topo.currentGeneration).toBe(0);
    topo.addShard(
      { name: 's0', zone: 'us-east', writeWeight: 1, healthy: true, joinedAt: 0 },
      new MapStore<Row>()
    );
    expect(topo.currentGeneration).toBe(1);
    const snap = topo.snapshot();
    expect(snap.generation).toBe(1);
    expect(snap.shards.length).toBe(1);
  });

  it('orders reads local-zone-first', () => {
    const r = new ShardRouter<Row>({ shardKeyField: 'tenantId' });
    const topo = new ShardTopology<Row>(r, []);
    topo.addShard(
      { name: 'east', zone: 'us-east', writeWeight: 1, healthy: true, joinedAt: 0 },
      new MapStore<Row>()
    );
    topo.addShard(
      { name: 'west', zone: 'us-west', writeWeight: 1, healthy: true, joinedAt: 0 },
      new MapStore<Row>()
    );
    expect(topo.readOrder('us-east')[0]).toBe('east');
    expect(topo.readOrder('us-west')[0]).toBe('west');
  });

  it('weighted write routing biases toward high-weight shards', () => {
    const r = new ShardRouter<Row>({ shardKeyField: 'tenantId' });
    const topo = new ShardTopology<Row>(r, []);
    topo.addShard(
      { name: 'heavy', zone: 'z', writeWeight: 9, healthy: true, joinedAt: 0 },
      new MapStore<Row>()
    );
    topo.addShard(
      { name: 'light', zone: 'z', writeWeight: 1, healthy: true, joinedAt: 0 },
      new MapStore<Row>()
    );
    const counts = { heavy: 0, light: 0 };
    let i = 0;
    // 10 draws spread evenly across [0.05, 0.95] — hits heavy 9×, light 1×.
    const rand = () => (i++ % 10) / 10 + 0.05;
    for (let k = 0; k < 10; k++) {
      counts[topo.pickWriteShard(rand).name as 'heavy' | 'light']++;
    }
    expect(counts.heavy).toBe(9);
    expect(counts.light).toBe(1);
  });

  it('unhealthy shards are skipped by routing', () => {
    const r = new ShardRouter<Row>({ shardKeyField: 'tenantId' });
    const topo = new ShardTopology<Row>(r, []);
    topo.addShard(
      { name: 'dead', zone: 'z', writeWeight: 100, healthy: true, joinedAt: 0 },
      new MapStore<Row>()
    );
    topo.addShard(
      { name: 'alive', zone: 'z', writeWeight: 1, healthy: true, joinedAt: 0 },
      new MapStore<Row>()
    );
    topo.setHealthy('dead', false);
    expect(topo.readOrder('z')).toEqual(['alive']);
  });
});

// --------------------------------------------------------------------------

describe('ShardingEngine — end-to-end', () => {
  it('writes route to shards; reads fan out and mask by role', () => {
    const eng = new ShardingEngine<Row>({
      shardKeyField: 'tenantId',
      shardCount: 4,
      maskPolicy: {
        rules: [{ field: 'ssn', mask: 'partial' }],
        bypassRoles: ['admin'],
      },
    });
    for (let i = 0; i < 20; i++) eng.insert(row(`id${i}`, `t${i % 4}`));

    const all = eng.query(Spec.all().node, { role: 'admin' });
    expect(all.rows.length).toBe(20);

    const masked = eng.query(Spec.field('tenantId').eq('t1').node, {
      role: 'analyst',
      shardKeyField: 'tenantId',
    });
    expect(masked.prunedToSingleShard).toBe(true);
    expect(masked.rows.length).toBe(5); // t1 ids: id1,id5,id9,id13,id17
    expect(masked.rows[0].ssn.startsWith('•')).toBe(true);
  });
});
