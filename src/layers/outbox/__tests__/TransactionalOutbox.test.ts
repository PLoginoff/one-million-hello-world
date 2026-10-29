/**
 * Transactional Outbox Tests
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  OutboxStore,
  OutboxRelay,
  type OutboxRecord,
} from '../implementations/TransactionalOutbox';

interface Msg {
  text: string;
}

function makeEntry(aggregateId: string, text: string, destination = 'events') {
  return { aggregateId, destination, type: 'TestEvent', payload: { text } as Msg };
}

describe('OutboxStore', () => {
  let store: OutboxStore<Msg>;

  beforeEach(() => {
    store = new OutboxStore<Msg>({ claimLeaseMs: 1000, maxAttempts: 3 });
  });

  it('enqueues records with per-aggregate sequence numbers', () => {
    const a1 = store.enqueue(makeEntry('A', 'a1'));
    const a2 = store.enqueue(makeEntry('A', 'a2'));
    const b1 = store.enqueue(makeEntry('B', 'b1'));
    expect(a1.aggregateSeq).toBe(0);
    expect(a2.aggregateSeq).toBe(1);
    expect(b1.aggregateSeq).toBe(0);
    expect(a1.state).toBe('PENDING');
    expect(a1.idempotencyKey).toBe(a1.id);
  });

  it('enqueueAll stages multiple records', () => {
    const rs = store.enqueueAll([makeEntry('A', '1'), makeEntry('A', '2'), makeEntry('B', '3')]);
    expect(rs).toHaveLength(3);
    expect(store.size).toBe(3);
  });

  it('claimBatch atomically marks records PROCESSING for the worker', () => {
    store.enqueue(makeEntry('A', 'x'));
    const claimed = store.claimBatch('w1', 10, 0);
    expect(claimed).toHaveLength(1);
    expect(claimed[0].state).toBe('PROCESSING');
    expect(claimed[0].claimedBy).toBe('w1');
    // Second claim by another worker gets nothing.
    expect(store.claimBatch('w2', 10, 0)).toHaveLength(0);
  });

  it('enforces per-aggregate ordering: only oldest unsent is claimable', () => {
    const r1 = store.enqueue(makeEntry('A', 'first'));
    const r2 = store.enqueue(makeEntry('A', 'second'));
    // Claim only r1 (the oldest for aggregate A)
    const batch = store.claimBatch('w1', 10, 0);
    expect(batch.map((r) => r.id)).toEqual([r1.id]);
    // While r1 is PROCESSING, r2 is not yet claimable.
    expect(store.claimBatch('w1', 10, 0)).toHaveLength(0);
    // Mark r1 sent → r2 becomes claimable.
    store.markSent(r1.id, 'w1', 10);
    const batch2 = store.claimBatch('w1', 10, 20);
    expect(batch2.map((r) => r.id)).toEqual([r2.id]);
  });

  it('different aggregates claim in parallel', () => {
    store.enqueue(makeEntry('A', 'a'));
    store.enqueue(makeEntry('B', 'b'));
    const batch = store.claimBatch('w1', 10, 0);
    expect(batch).toHaveLength(2);
  });

  it('expired claims revert to PENDING and are reclaimable', () => {
    const r = store.enqueue(makeEntry('A', 'x'));
    store.claimBatch('w1', 10, 0); // lease 1000 → expires at 1000
    // At t=1500 the claim expired; w2 can claim.
    const reclaimed = store.claimBatch('w2', 10, 1500);
    expect(reclaimed.map((x) => x.id)).toEqual([r.id]);
    expect(reclaimed[0].claimedBy).toBe('w2');
  });

  it('markSent only succeeds for the claiming worker', () => {
    const r = store.enqueue(makeEntry('A', 'x'));
    store.claimBatch('w1', 10, 0);
    expect(store.markSent(r.id, 'w2', 10)).toBe(false);
    expect(store.markSent(r.id, 'w1', 10)).toBe(true);
    expect(store.get(r.id)!.state).toBe('SENT');
    expect(store.get(r.id)!.sentAt).toBe(10);
  });

  it('markFailed returns to PENDING below maxAttempts, then FAILED', () => {
    const s = new OutboxStore<Msg>({ maxAttempts: 2 });
    const r = s.enqueue(makeEntry('A', 'x'));
    s.claimBatch('w', 10, 0);
    expect(s.markFailed(r.id, 'w', 'e1')).toBe('PENDING');
    s.claimBatch('w', 10, 10);
    expect(s.markFailed(r.id, 'w', 'e2')).toBe('FAILED');
    expect(s.get(r.id)!.attempts).toBe(2);
    expect(s.get(r.id)!.lastError).toBe('e2');
    // FAILED records are not reclaimable
    expect(s.claimBatch('w', 10, 20)).toHaveLength(0);
  });

  it('requeue brings a FAILED record back to PENDING', () => {
    const s = new OutboxStore<Msg>({ maxAttempts: 1 });
    const r = s.enqueue(makeEntry('A', 'x'));
    s.claimBatch('w', 10, 0);
    s.markFailed(r.id, 'w', 'e');
    expect(s.get(r.id)!.state).toBe('FAILED');
    expect(s.requeue(r.id)).toBe(true);
    expect(s.get(r.id)!.state).toBe('PENDING');
    expect(s.claimBatch('w', 10, 20)).toHaveLength(1);
  });

  it('releaseClaim returns the record to PENDING', () => {
    const r = store.enqueue(makeEntry('A', 'x'));
    store.claimBatch('w1', 10, 0);
    expect(store.releaseClaim(r.id, 'w1')).toBe(true);
    expect(store.get(r.id)!.state).toBe('PENDING');
  });

  it('query filters by state/aggregate and orders by seq', () => {
    store.enqueue(makeEntry('B', 'b1'));
    store.enqueue(makeEntry('A', 'a1'));
    store.enqueue(makeEntry('A', 'a2'));
    const aRecords = store.query({ aggregateId: 'A' });
    expect(aRecords.map((r) => r.aggregateSeq)).toEqual([0, 1]);
    expect(store.query({ state: 'SENT' })).toHaveLength(0);
    expect(store.countByState().PENDING).toBe(3);
  });

  it('cleanup removes SENT records past retention', () => {
    const s = new OutboxStore<Msg>({ sentRetentionMs: 100 });
    const r = s.enqueue(makeEntry('A', 'x'));
    s.claimBatch('w', 10, 0);
    s.markSent(r.id, 'w', 50);
    expect(s.cleanup(140)).toBe(0); // 90ms old
    expect(s.cleanup(151)).toBe(1);
    expect(s.size).toBe(0);
  });

  it('cleanup never removes PENDING records', () => {
    const s = new OutboxStore<Msg>({ sentRetentionMs: 1 });
    s.enqueue(makeEntry('A', 'x'));
    expect(s.cleanup(99999)).toBe(0);
    expect(s.size).toBe(1);
  });
});

describe('OutboxRelay', () => {
  let store: OutboxStore<Msg>;
  let delivered: OutboxRecord<Msg>[];

  beforeEach(() => {
    store = new OutboxStore<Msg>({ claimLeaseMs: 1000, maxAttempts: 3 });
    delivered = [];
  });

  it('polls, dispatches, and marks records SENT', async () => {
    store.enqueueAll([makeEntry('A', '1'), makeEntry('A', '2'), makeEntry('B', '3')]);
    const relay = new OutboxRelay(store, async (r) => {
      delivered.push(r);
    });
    let stats = await relay.poll(0);
    // First poll: only the head of each aggregate (A:0 and B:0) is claimed.
    expect(stats.claimed).toBe(2);
    expect(delivered.map((r) => r.payload.text)).toContain('1');
    expect(delivered.map((r) => r.payload.text)).toContain('3');

    stats = await relay.poll(10);
    expect(delivered).toHaveLength(3);
    expect(store.countByState().SENT).toBe(3);
  });

  it('retries failed dispatches on subsequent polls', async () => {
    store.enqueue(makeEntry('A', 'x'));
    let calls = 0;
    const relay = new OutboxRelay(store, async () => {
      calls++;
      if (calls === 1) throw new Error('net');
    });
    const s1 = await relay.poll(0);
    expect(s1.retried).toBe(1);
    const s2 = await relay.poll(10);
    expect(s2.sent).toBe(1);
    expect(store.countByState().SENT).toBe(1);
  });

  it('marks records FAILED after maxAttempts', async () => {
    const s = new OutboxStore<Msg>({ maxAttempts: 2, claimLeaseMs: 1 });
    s.enqueue(makeEntry('A', 'x'));
    const relay = new OutboxRelay(s, async () => {
      throw new Error('always');
    });
    await relay.poll(0);
    await relay.poll(10);
    // attempts exhausted → FAILED, no longer claimed
    expect(s.countByState().FAILED).toBe(1);
    const s3 = await relay.poll(20);
    expect(s3.claimed).toBe(0);
  });

  it('deduplicates by idempotency key (at-least-once without double delivery)', async () => {
    const r = store.enqueue({ ...makeEntry('A', 'x'), idempotencyKey: 'key-1' });
    // Simulate: first dispatch succeeded downstream but markSent failed
    // (relay crashed). Re-enqueue equivalent message with same key.
    let dispatched = 0;
    const relay = new OutboxRelay(store, async () => {
      dispatched++;
    });
    await relay.poll(0);
    store.enqueue({ ...makeEntry('A', 'x-dup'), idempotencyKey: 'key-1' });
    await relay.poll(10);
    // Second record was skipped by dedup but still marked SENT
    expect(dispatched).toBe(1);
    expect(store.countByState().SENT).toBe(2);
    expect(relay.stats().totalDuplicates).toBe(1);
  });

  it('ordering is preserved per aggregate even across failures', async () => {
    const s = new OutboxStore<Msg>({ claimLeaseMs: 10 });
    s.enqueueAll([makeEntry('A', 'm1'), makeEntry('A', 'm2'), makeEntry('A', 'm3')]);
    const order: string[] = [];
    let failOnce = true;
    const relay = new OutboxRelay(s, async (r) => {
      if (r.payload.text === 'm1' && failOnce) {
        failOnce = false;
        throw new Error('flaky');
      }
      order.push(r.payload.text);
    });
    await relay.poll(0); // m1 fails → PENDING
    expect(order).toHaveLength(0); // nothing dispatched successfully
    await relay.poll(20); // retry m1 → then m2, m3 in order
    await relay.poll(40);
    await relay.poll(60);
    expect(order).toEqual(['m1', 'm2', 'm3']);
  });

  it('relay stats track polls and deliveries', async () => {
    store.enqueue(makeEntry('A', 'x'));
    const relay = new OutboxRelay(store, async () => {});
    await relay.poll(0);
    await relay.poll(10);
    const s = relay.stats();
    expect(s.totalPolls).toBe(2);
    expect(s.totalSent).toBe(1);
    expect(s.running).toBe(false);
  });
});
