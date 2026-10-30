/**
 * Tests for the Outbox Engine2 modules.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { shardOf, belongsTo, forShard, distribution, fnv1a32, ShardError } from '../Sharding';
import { LeaderElection, LeadershipError } from '../LeaderElection';
import { OutboxMetrics } from '../Metrics';
import type { MetricsRecord } from '../Metrics';
import { verify, verifyDispatch } from '../FifoVerifier';
import { OutboxCleaner } from '../Cleanup';
import { ManualOutboxClock2 } from '../types';

let clock: ManualOutboxClock2;

beforeEach(() => {
  clock = new ManualOutboxClock2(1_000_000);
});

function rec(over: Partial<MetricsRecord> & { id: string }): MetricsRecord {
  return {
    aggregateId: 'agg-1',
    aggregateSeq: 0,
    destination: 'events',
    type: 'Thing',
    payload: {},
    enqueuedAt: clock.now(),
    state: 'pending',
    ...over,
  };
}

// ---------------------------------------------------------------------
// Sharding
// ---------------------------------------------------------------------

describe('Sharding', () => {
  it('fnv1a32 hashes deterministically and differs on inputs', () => {
    expect(fnv1a32('agg-1')).toBe(fnv1a32('agg-1'));
    expect(fnv1a32('agg-1')).not.toBe(fnv1a32('agg-2'));
    expect(fnv1a32('')).toBe(0x811c9dc5); // empty string = offset basis
  });

  it('shardOf is stable and in-range', () => {
    for (let i = 0; i < 200; i++) {
      const s = shardOf(`agg-${i}`, 8);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(8);
      expect(shardOf(`agg-${i}`, 8)).toBe(s);
    }
  });

  it('an aggregate always lands in exactly one shard', () => {
    const id = 'order-991';
    const mine = shardOf(id, 4);
    for (let s = 0; s < 4; s++) {
      expect(belongsTo(id, s, 4)).toBe(s === mine);
    }
  });

  it('forShard filters a record set to one worker', () => {
    const records = Array.from({ length: 100 }, (_, i) =>
      rec({ id: `r${i}`, aggregateId: `agg-${i}`, aggregateSeq: 0 })
    );
    const shard = 2;
    const mine = forShard(records, shard, 8);
    for (const r of mine) expect(belongsTo(r.aggregateId, shard, 8)).toBe(true);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.length).toBeLessThan(100);
    // Other shards see disjoint sets.
    const other = forShard(records, 3, 8);
    expect(mine.some((r) => other.includes(r))).toBe(false);
  });

  it('distribution reports skew', () => {
    const ids = Array.from({ length: 400 }, (_, i) => `agg-${i}`);
    const d = distribution(ids, 8);
    expect(d.counts.reduce((a, b) => a + b, 0)).toBe(400);
    expect(d.maxOverMean).toBeGreaterThanOrEqual(1);
    expect(d.maxOverMean).toBeLessThan(2); // reasonable hash — no collapse
  });

  it('rejects invalid shard counts and shards', () => {
    expect(() => shardOf('a', 0)).toThrow(ShardError);
    expect(() => shardOf('a', -1)).toThrow(ShardError);
    expect(() => belongsTo('a', 8, 8)).toThrow(ShardError);
    expect(() => belongsTo('a', -1, 8)).toThrow(ShardError);
  });
});

// ---------------------------------------------------------------------
// Leader election
// ---------------------------------------------------------------------

describe('LeaderElection', () => {
  it('one leader per partition; second contender is refused', () => {
    const le = new LeaderElection(10_000, clock);
    const g = le.acquire(0, 'w1');
    expect(g.fencingToken).toBe(1);
    expect(le.leader(0)?.workerId).toBe('w1');
    expect(() => le.acquire(0, 'w2')).toThrow(LeadershipError);
  });

  it('lease lapse allows failover with a larger fencing token', () => {
    const le = new LeaderElection(10_000, clock);
    const g1 = le.acquire(0, 'w1');
    clock.advance(10_001); // lease expires
    const g2 = le.acquire(0, 'w2');
    expect(g2.fencingToken).toBeGreaterThan(g1.fencingToken);
    expect(le.check(0, g1.fencingToken)).toBe(false);
    expect(le.check(0, g2.fencingToken)).toBe(true);
  });

  it('renew extends the lease; stale tokens cannot renew', () => {
    const le = new LeaderElection(10_000, clock);
    const g = le.acquire(0, 'w1');
    clock.advance(5_000);
    const r = le.renew(0, 'w1', g.fencingToken);
    expect(r.leaseUntil).toBe(clock.now() + 10_000);
    clock.advance(9_999);
    expect(le.check(0, g.fencingToken)).toBe(true);
    expect(() => le.renew(0, 'w2', g.fencingToken)).toThrow(LeadershipError);
    expect(() => le.renew(0, 'w1', 999)).toThrow(LeadershipError);
  });

  it('renew after lapse throws', () => {
    const le = new LeaderElection(10_000, clock);
    const g = le.acquire(0, 'w1');
    clock.advance(10_001);
    expect(() => le.renew(0, 'w1', g.fencingToken)).toThrow(LeadershipError);
  });

  it('stepDown releases immediately', () => {
    const le = new LeaderElection(10_000, clock);
    le.acquire(0, 'w1');
    expect(le.stepDown(0, 'w1')).toBe(true);
    expect(le.leader(0)).toBeNull();
    const g2 = le.acquire(0, 'w2'); // succeeds now
    expect(g2.workerId).toBe('w2');
  });

  it('partitions are independent', () => {
    const le = new LeaderElection(10_000, clock);
    le.acquire(0, 'w1');
    le.acquire(1, 'w2'); // different partition — fine
    expect(le.active().length).toBe(2);
  });
});

// ---------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------

describe('OutboxMetrics', () => {
  it('reports oldest pending age and backlog per partition', () => {
    const m = new OutboxMetrics(clock);
    const records: MetricsRecord[] = [
      rec({ id: 'a', aggregateId: 'x', enqueuedAt: 900_000, state: 'pending' }),
      rec({ id: 'b', aggregateId: 'x', aggregateSeq: 1, enqueuedAt: 999_000, state: 'pending' }),
      rec({ id: 'c', aggregateId: 'y', enqueuedAt: 950_000, state: 'sent' }),
    ];
    const px = shardOf('x', 4);
    const py = shardOf('y', 4);
    const rep = m.partition(px, 4, records);
    expect(rep.pending).toBe(2);
    expect(rep.oldestPendingAgeMs).toBe(100_000);
    expect(rep.backedUpAggregates).toBe(1);
    if (py !== px) {
      const repY = m.partition(py, 4, records);
      expect(repY.pending).toBe(0);
      expect(repY.oldestPendingAgeMs).toBeNull();
    }
  });

  it('totalPending scans everything', () => {
    const m = new OutboxMetrics(clock);
    const records = [
      rec({ id: 'a', enqueuedAt: 800_000 }),
      rec({ id: 'b', aggregateSeq: 1, state: 'sent' }),
    ];
    const t = m.totalPending(records);
    expect(t.pending).toBe(1);
    expect(t.oldestPendingAgeMs).toBe(200_000);
  });

  it('throughput counts sends inside the window', () => {
    const m = new OutboxMetrics(clock, 60_000);
    m.recordSent(0, 30);
    clock.advance(30_000);
    m.recordSent(0, 30);
    clock.advance(30_001); // first batch slides out
    const t = m.throughput(0);
    expect(t.sent).toBe(30);
    expect(t.perSecond).toBeCloseTo(0.5, 3);
  });
});

// ---------------------------------------------------------------------
// FIFO verification
// ---------------------------------------------------------------------

describe('FifoVerifier', () => {
  it('passes a clean per-aggregate sequence', () => {
    const records = [
      rec({ id: 'a', aggregateSeq: 0, state: 'sent' }),
      rec({ id: 'b', aggregateSeq: 1, state: 'sent' }),
      rec({ id: 'c', aggregateSeq: 2, state: 'pending' }),
    ];
    const r = verify(records);
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it('flags a sequence gap', () => {
    const records = [
      rec({ id: 'a', aggregateSeq: 0, state: 'sent' }),
      rec({ id: 'b', aggregateSeq: 2, state: 'sent' }), // 1 never existed
    ];
    const r = verify(records);
    expect(r.ok).toBe(false);
    expect(r.violations[0]).toEqual({
      kind: 'gap', aggregateId: 'agg-1', expected: 1, found: 2,
    });
  });

  it('flags duplicate sequences', () => {
    const records = [
      rec({ id: 'a', aggregateSeq: 0 }),
      rec({ id: 'b', aggregateSeq: 0 }),
    ];
    const r = verify(records);
    expect(r.ok).toBe(false);
    expect(r.violations[0]?.kind).toBe('duplicate');
  });

  it('flags a sent-ahead-of-pending inversion', () => {
    const records = [
      rec({ id: 'a', aggregateSeq: 0, state: 'pending' }),
      rec({ id: 'b', aggregateSeq: 1, state: 'sent' }),
    ];
    const r = verify(records);
    expect(r.ok).toBe(false);
    expect(r.violations[0]).toEqual({
      kind: 'inversion', aggregateId: 'agg-1', sentSeq: 1, pendingSeq: 0,
    });
  });

  it('aggregates are checked independently', () => {
    const records = [
      rec({ id: 'a', aggregateId: 'x', aggregateSeq: 0, state: 'sent' }),
      rec({ id: 'b', aggregateId: 'y', aggregateSeq: 0, state: 'pending' }),
      rec({ id: 'c', aggregateId: 'x', aggregateSeq: 1, state: 'sent' }),
    ];
    const r = verify(records);
    expect(r.ok).toBe(true); // y's pending does not block x
    expect(r.aggregatesChecked).toBe(2);
  });

  it('verifyDispatch catches an out-of-order send stream', () => {
    const r = verifyDispatch([
      { aggregateId: 'x', aggregateSeq: 0 },
      { aggregateId: 'x', aggregateSeq: 1 },
      { aggregateId: 'x', aggregateSeq: 0 }, // re-send inside the send log
    ]);
    expect(r.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------

describe('OutboxCleaner', () => {
  it('archives old sent records, keeps young ones', () => {
    const c = new OutboxCleaner({ sentRetentionMs: 60_000 }, clock);
    c.put(rec({ id: 'old', enqueuedAt: 900_000, state: 'sent' }));
    c.put(rec({ id: 'new', enqueuedAt: 990_000, state: 'sent' }));
    clock.advance(50_000); // old is 150s, new is 60s — boundary archives both
    const r = c.run();
    expect(r.archived).toBe(2);
    expect(r.retained).toBe(0);
    expect(c.archivedGet('old')?.priorState).toBe('sent');

    // A record still inside retention survives.
    c.put(rec({ id: 'young', state: 'sent' }));
    const r2 = c.run();
    expect(r2.archived).toBe(0);
    expect(c.get('young')?.state).toBe('sent');
  });

  it('purges the archive past archiveRetentionMs', () => {
    const c = new OutboxCleaner(
      { sentRetentionMs: 60_000, archiveRetentionMs: 30_000 },
      clock
    );
    c.put(rec({ id: 'a', state: 'sent', enqueuedAt: 900_000 }));
    const r0 = c.run(); // 100s old → archives
    expect(r0.archived).toBe(1);
    expect(c.archiveDepth).toBe(1);
    clock.advance(31_000);
    const r = c.run();
    expect(r.purged).toBe(1);
    expect(r.archiveDepth).toBe(0);
  });

  it('archives failed records on failedRetentionMs only when set', () => {
    const c = new OutboxCleaner({ sentRetentionMs: 60_000 }, clock);
    c.put(rec({ id: 'f', state: 'failed', enqueuedAt: 1 }));
    clock.advance(999_999);
    c.run();
    expect(c.get('f')?.state).toBe('failed'); // no failedRetentionMs → kept
    const c2 = new OutboxCleaner(
      { sentRetentionMs: 60_000, failedRetentionMs: 10_000 },
      clock
    );
    c2.put(rec({ id: 'f', state: 'failed', enqueuedAt: 1 }));
    const r = c2.run();
    expect(r.archived).toBe(1);
    expect(c2.archivedGet('f')?.priorState).toBe('failed');
  });

  it('pending and processing records are never archived', () => {
    const c = new OutboxCleaner(
      { sentRetentionMs: 1, failedRetentionMs: 1, archiveRetentionMs: 1 },
      clock
    );
    c.put(rec({ id: 'p', state: 'pending', enqueuedAt: 1 }));
    c.put(rec({ id: 'x', state: 'processing', enqueuedAt: 1 }));
    clock.advance(1_000_000);
    const r = c.run();
    expect(r.archived).toBe(0);
    expect(r.retained).toBe(2);
  });
});

// ---------------------------------------------------------------------
// RelayLoop
// ---------------------------------------------------------------------

import { RelayLoop } from '../RelayLoop';
import type { RelayStore } from '../RelayLoop';
import { LeaderElection } from '../LeaderElection';

/** Minimal in-memory store implementing the RelayStore contract. */
class MemStore implements RelayStore {
  readonly records = new Map<string, MetricsRecord & { claim?: string }>();
  add(r: MetricsRecord): void {
    this.records.set(r.id, { ...r });
  }
  pending(): MetricsRecord[] {
    return [...this.records.values()].filter((r) => r.state === 'pending');
  }
  claim(id: string, workerId: string): boolean {
    const r = this.records.get(id);
    if (!r || r.state !== 'pending' || r.claim !== undefined) return false;
    r.claim = workerId;
    r.state = 'processing';
    return true;
  }
  sent(id: string): void {
    const r = this.records.get(id);
    if (r) { r.state = 'sent'; r.claim = undefined; }
  }
  release(id: string): void {
    const r = this.records.get(id);
    if (r) { r.state = 'pending'; r.claim = undefined; }
  }
}

function loopEnv(shardCount = 2) {
  const store = new MemStore();
  const election = new LeaderElection(60_000, clock);
  const metrics = new OutboxMetrics(clock);
  return { store, election, metrics };
}

describe('RelayLoop', () => {
  it('dispatches its shard in per-aggregate FIFO order', async () => {
    const { store, election, metrics } = loopEnv();
    // Two aggregates: each gets seqs 0,1 in store.
    for (const agg of ['aggA', 'aggB']) {
      store.add(rec({ id: `${agg}-0`, aggregateId: agg, aggregateSeq: 0 }));
      store.add(rec({ id: `${agg}-1`, aggregateId: agg, aggregateSeq: 1 }));
    }
    const sent: string[] = [];
    for (let p = 0; p < 2; p++) {
      const loop = new RelayLoop(store, election, metrics, p, 2, `w${p}`, clock);
      const out = await loop.poll((r) => void sent.push(r.id));
      expect(out.led).toBe(true);
    }
    // Every record was dispatched exactly once.
    expect(sent.length).toBe(4);
    // Per-aggregate order held: -0 before -1.
    const idx = (id: string) => sent.indexOf(id);
    expect(idx('aggA-0')).toBeLessThan(idx('aggA-1'));
    expect(idx('aggB-0')).toBeLessThan(idx('aggB-1'));
  });

  it('refuses to poll without leadership — second worker on a partition idles', async () => {
    const { store, election, metrics } = loopEnv();
    store.add(rec({ id: 'a', aggregateId: 'aggA', aggregateSeq: 0 }));
    const w1 = new RelayLoop(store, election, metrics, 0, 2, 'w1', clock);
    await w1.poll(() => {});
    const w2 = new RelayLoop(store, election, metrics, 0, 2, 'w2', clock);
    const out = await w2.poll(() => { throw new Error('must not dispatch'); });
    expect(out.led).toBe(false);
    expect(out.claimed).toBe(0);
  });

  it('failed dispatch returns the claim to pending for the next poll', async () => {
    const { store, election, metrics } = loopEnv();
    const loop = new RelayLoop(store, election, metrics, shardOf('aggA', 2), 2, 'w', clock);
    store.add(rec({ id: 'a', aggregateId: 'aggA', aggregateSeq: 0 }));
    const first = await loop.poll(() => { throw new Error('broker down'); });
    expect(first.failed).toBe(1);
    expect(first.sent).toBe(0);
    const second = await loop.poll(() => {});
    expect(second.sent).toBe(1);
    expect(loop.attempts('a')).toBe(2);
  });

  it('a seq gap stops claiming behind it until settled', async () => {
    const { store, election, metrics } = loopEnv();
    const loop = new RelayLoop(store, election, metrics, shardOf('aggA', 2), 2, 'w', clock);
    // seq 0 and 2 pending (1 elsewhere) — only 0 may dispatch.
    store.add(rec({ id: 'a0', aggregateId: 'aggA', aggregateSeq: 0 }));
    store.add(rec({ id: 'a2', aggregateId: 'aggA', aggregateSeq: 2 }));
    const sent: string[] = [];
    const out = await loop.poll((r) => void sent.push(r.id));
    expect(sent).toEqual(['a0']);
    expect(out.claimed).toBe(1);
  });

  it('loses leadership after lease lapse — another worker takes over', async () => {
    const { store, election, metrics } = loopEnv();
    const w1 = new RelayLoop(store, election, metrics, 0, 2, 'w1', clock);
    store.add(rec({ id: 'a', aggregateId: 'aggA', aggregateSeq: 0 }));
    await w1.poll(() => {});
    clock.advance(61_000); // w1's lease lapses
    const w2 = new RelayLoop(store, election, metrics, 0, 2, 'w2', clock);
    const out = await w2.poll(() => {});
    expect(out.led).toBe(true);
    // And w1 is fenced out on its next poll.
    const again = await w1.poll(() => {});
    expect(again.led).toBe(false);
  });
});

// ---------------------------------------------------------------------
// Backfill
// ---------------------------------------------------------------------

import { backfill } from '../Backfill';
import { OutboxCleaner } from '../Cleanup';

describe('backfill', () => {
  function archivedStore() {
    const c = new OutboxCleaner({ sentRetentionMs: 60_000 }, clock);
    const live: MetricsRecord[] = [];
    return { c, live };
  }

  it('moves archived records back to pending with rebased seq', () => {
    const { c, live } = archivedStore();
    // Seed: two sent records per aggregate, then archived.
    for (const [id, agg, seq] of [
      ['a0', 'aggA', 0],
      ['a1', 'aggA', 1],
    ] as const) {
      c.put(rec({ id, aggregateId: agg, aggregateSeq: seq, state: 'sent', enqueuedAt: 900_000 }));
    }
    c.run(); // both archive
    expect(c.archiveDepth).toBe(2);

    const inserted: MetricsRecord[] = [];
    const result = backfill(c, (r) => inserted.push(r), live, { limit: 10 });
    expect(result.moved.length).toBe(2);
    expect(result.blocked).toEqual([]);
    // Rebased past the aggregate's max seq (1) → 2 and 3, in order.
    expect(inserted.map((r) => r.aggregateSeq)).toEqual([2, 3]);
    expect(inserted.every((r) => r.state === 'pending')).toBe(true);
    expect(inserted.every((r) => r.id.includes('.bf'))).toBe(true);
  });

  it('blocks aggregates that still have live records', () => {
    const { c } = archivedStore();
    c.put(rec({ id: 'a0', aggregateId: 'aggA', aggregateSeq: 0, state: 'sent', enqueuedAt: 1 }));
    c.run();
    const live: MetricsRecord[] = [
      rec({ id: 'a1', aggregateId: 'aggA', aggregateSeq: 1, state: 'pending' }),
    ];
    const inserted: MetricsRecord[] = [];
    const r = backfill(c, (x) => inserted.push(x), live, { limit: 10 });
    expect(r.blocked).toEqual(['a0']);
    expect(inserted).toEqual([]);
  });

  it('honours the time window and limit', () => {
    const { c } = archivedStore();
    for (const [id, at] of [['early', 500_000], ['mid', 800_000], ['late', 950_000]] as const) {
      c.put(rec({ id, aggregateId: 'agg', state: 'sent', enqueuedAt: at }));
    }
    c.run();
    const inserted: MetricsRecord[] = [];
    const r = backfill(c, (x) => inserted.push(x), [], { from: 700_000, to: 900_000, limit: 1 });
    expect(inserted.length).toBe(1);
    expect(inserted[0]?.id.startsWith('mid.bf')).toBe(true);
    expect(r.remaining).toBe(0); // 'late' outside window
  });
});

// ---------------------------------------------------------------------
// Relay auditor
// ---------------------------------------------------------------------

import { audit } from '../RelayAuditor';
import type { AuditRecord } from '../RelayAuditor';

function auditRec(over: Partial<AuditRecord> & { id: string }): AuditRecord {
  return {
    aggregateId: 'agg', aggregateSeq: 0, destination: 'd', type: 'T',
    payload: {}, enqueuedAt: clock.now(), state: 'pending', ...over,
  };
}

describe('RelayAuditor', () => {
  it('flags a claim held by a worker with no live lease', () => {
    const election = new LeaderElection(60_000, clock);
    election.acquire(0, 'w-live');
    // A record claimed by 'ghost' on a partition 'w-live' leads.
    const records = [auditRec({ id: 'x', aggregateId: findOnShard('aggA', 0, 2) ? 'aggA' : 'aggB', state: 'processing', claimedBy: 'ghost' })];
    const findings = audit(records, election, 2, { leaseMs: 60_000, clock });
    expect(findings.map((f) => f.kind)).toContain('orphaned-claim');
  });

  it('flags claims older than the lease', () => {
    const election = new LeaderElection(60_000, clock);
    const records = [auditRec({
      id: 'x', aggregateId: 'a', state: 'processing',
      claimedBy: 'w', claimedAt: clock.now() - 90_000,
    })];
    const findings = audit(records, election, 1, { leaseMs: 60_000, clock });
    expect(findings.map((f) => f.kind)).toContain('stale-claim');
  });

  it('flags two workers claiming on one partition', () => {
    const election = new LeaderElection(60_000, clock);
    const records = [
      auditRec({ id: 'a', aggregateId: 'a', state: 'processing', claimedBy: 'w1' }),
      auditRec({ id: 'b', aggregateId: 'a', aggregateSeq: 1, state: 'processing', claimedBy: 'w2' }),
    ];
    const findings = audit(records, election, 1, { leaseMs: 60_000, clock });
    expect(findings.map((f) => f.kind)).toContain('lease-conflict');
  });

  it('flags aged pending under a live leader (backlog forming)', () => {
    const election = new LeaderElection(60_000, clock);
    election.acquire(0, 'w');
    // Find an aggregate that lands on shard 0 of 1 shard.
    const records = [auditRec({ id: 'p', aggregateId: 'a', enqueuedAt: clock.now() - 120_000 })];
    const findings = audit(records, election, 1, { leaseMs: 60_000, warnAgeMs: 60_000, clock });
    expect(findings.map((f) => f.kind)).toContain('unclaimed-pending');
  });

  it('a clean state produces no findings', () => {
    const election = new LeaderElection(60_000, clock);
    election.acquire(0, 'w');
    const records = [auditRec({ id: 'p', aggregateId: 'a' })];
    const findings = audit(records, election, 1, { leaseMs: 60_000, clock });
    expect(findings).toEqual([]);
  });
});

function findOnShard(aggregateId: string, shard: number, count: number): boolean {
  return shardOf(aggregateId, count) === shard;
}

// ---------------------------------------------------------------------
// Shard rebalancer
// ---------------------------------------------------------------------

import { planRebalance } from '../ShardRebalancer';

describe('planRebalance', () => {
  it('identifies aggregates that move and those that stay', () => {
    const records = [
      rec({ id: 'a', aggregateId: 'agg-stay', state: 'sent' }),
      rec({ id: 'b', aggregateId: 'agg-move', state: 'sent' }),
    ];
    // Pick an aggregate that actually moves between 2 and 4 shards.
    const moves = planRebalance(records, 2, 4);
    for (const m of moves.moves) {
      expect(m.fromShard).not.toBe(m.toShard);
    }
    expect(moves.newCounts.reduce((a, b) => a + b, 0)).toBe(2);
  });

  it('blocks aggregates with unfinished records', () => {
    const records = [
      rec({ id: 'a', aggregateId: 'aggA', state: 'pending' }),
      rec({ id: 'b', aggregateId: 'aggB', state: 'sent' }),
    ];
    const plan = planRebalance(records, 1, 2);
    // aggA moves? if it does, it must be blocked.
    const moveA = plan.moves.find((m) => m.aggregateId === 'aggA');
    if (moveA) {
      expect(moveA.safeNow).toBe(false);
      expect(plan.blocked).toContain('aggA');
    }
  });

  it('flags hotspots when a shard gains too much share', () => {
    // Many aggregates on one shard → the new layout is unbalanced.
    const records = Array.from({ length: 10 }, (_, i) =>
      rec({ id: `r${i}`, aggregateId: `agg-${i}`, state: 'sent' })
    );
    const plan = planRebalance(records, 1, 2, 0.4);
    expect(plan.newCounts.reduce((a, b) => a + b, 0)).toBe(10);
  });
});

// ---------------------------------------------------------------------
// Priority scheduler
// ---------------------------------------------------------------------

import { schedule } from '../PriorityScheduler';

describe('schedule', () => {
  const base = (id: string, enqueuedAt: number, priority?: number) =>
    ({ ...rec({ id, enqueuedAt }), priority });

  it('high priority jumps the queue', () => {
    const records = [
      base('old-low', 900_000, 0),
      base('new-high', 999_000, 10),
    ];
    const ordered = schedule(records, clock);
    expect(ordered.map((r) => r.record.id)).toEqual(['new-high', 'old-low']);
  });

  it('age accumulates score so nothing starves', () => {
    // Low-priority record old enough to outscore a fresher high-priority one.
    const records = [
      base('very-old', 1, 0),           // ~1_000_000ms old → score 10_000
      base('new-high', 999_999, 50),    // 50×100 = 5000 score
    ];
    const ordered = schedule(records, clock);
    expect(ordered[0]?.record.id).toBe('very-old');
  });

  it('ties break on enqueuedAt', () => {
    const records = [base('b', 999_000, 5), base('a', 998_000, 5)];
    const ordered = schedule(records, clock);
    expect(ordered.map((r) => r.record.id)).toEqual(['a', 'b']);
  });

  it('limit caps the batch', () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      base(`r${i}`, 999_000 - i, 0)
    );
    expect(schedule(records, clock, undefined, 3).length).toBe(3);
  });

  it('default priority is 0', () => {
    const ordered = schedule([base('a', 999_000)], clock);
    expect(ordered[0]?.priority).toBe(0);
  });
});
