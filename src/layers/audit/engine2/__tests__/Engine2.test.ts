/**
 * Tests for audit engine2: ComplianceReportGenerator, AuditLogSearch,
 * LogShipper and RetentionSimulator.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { AuditStore } from '../../engine/AuditStore';
import { AuditPipeline } from '../../engine/AuditPipeline';
import type { AuditRecord, LegalHold, RetentionPolicy } from '../../engine/types';
import { ComplianceReportGenerator } from '../ComplianceReportGenerator';
import { AuditLogSearch, parseSearchQuery } from '../AuditLogSearch';
import { LogShipper, InMemoryLogSink2 } from '../LogShipper';
import { RetentionSimulator } from '../RetentionSimulator';
import { SessionCorrelator } from '../SessionCorrelator';

class FakeClock {
  t = 1_000_000;
  now(): number {
    return this.t;
  }
  advance(ms: number): void {
    this.t += ms;
  }
}

function makeStore(clock: FakeClock): { pipe: AuditPipeline; store: AuditStore } {
  const pipe = new AuditPipeline({ clock });
  return { pipe, store: pipe.store };
}

describe('ComplianceReportGenerator', () => {
  let clock: FakeClock;
  let pipe: AuditPipeline;

  beforeEach(() => {
    clock = new FakeClock();
    pipe = new AuditPipeline({ clock });
  });

  it('reports covered and gap controls for SOC2', () => {
    pipe.capture({ actor: 'u1', action: 'auth.login', outcome: 'success' });
    pipe.capture({ actor: 'u1', action: 'auth.failed', outcome: 'failure' });
    pipe.capture({ actor: 'ops', action: 'backup.run', resourceType: 'backup', outcome: 'success' });

    const gen = new ComplianceReportGenerator({ clock });
    const report = gen.generate('soc2', pipe.store);
    expect(report.framework).toBe('soc2');
    const cc61 = report.findings.find((f) => f.controlId === 'CC6.1');
    expect(cc61?.status).toBe('covered');
    expect(cc61?.evidenceRefs.length).toBe(2);
    expect(cc61?.failuresObserved).toBe(1);
    const a12 = report.findings.find((f) => f.controlId === 'A1.2');
    expect(a12?.status).toBe('covered'); // resourceType match
    const gap = report.findings.find((f) => f.controlId === 'CC7.3');
    expect(gap?.status).toBe('gap');
    expect(report.gaps).toBeGreaterThan(0);
    expect(report.anchorHash).not.toBe('GENESIS');
  });

  it('supports GDPR mappings with minEvidence', () => {
    pipe.capture({ actor: 'u', action: 'data.process', outcome: 'success' });
    const gen = new ComplianceReportGenerator({ clock });
    const report = gen.generate('gdpr', pipe.store);
    const art30 = report.findings.find((f) => f.controlId === 'art30');
    expect(art30?.status).toBe('partial'); // needs 3, has 1
  });

  it('renders a text report', () => {
    pipe.capture({ actor: 'u', action: 'auth.login', outcome: 'success' });
    const gen = new ComplianceReportGenerator({ clock });
    const text = gen.renderText(gen.generate('soc2', pipe.store));
    expect(text).toContain('SOC2');
    expect(text).toContain('CC6.1');
    expect(text).toContain('COVERED');
  });

  it('filters by time window', () => {
    pipe.capture({ actor: 'u', action: 'auth.login', outcome: 'success' });
    clock.advance(10_000);
    const gen = new ComplianceReportGenerator({ clock });
    const report = gen.generate('soc2', pipe.store, { fromMs: clock.t });
    const cc61 = report.findings.find((f) => f.controlId === 'CC6.1');
    expect(cc61?.status).toBe('gap'); // event happened before window
  });
});

describe('AuditLogSearch', () => {
  let pipe: AuditPipeline;
  let clock: FakeClock;
  const search = new AuditLogSearch();

  beforeEach(() => {
    clock = new FakeClock();
    pipe = new AuditPipeline({ clock });
    pipe.capture({
      actor: 'alice',
      action: 'auth.login',
      resource: 'session:1',
      outcome: 'success',
      details: { ip: '10.0.0.1', method: 'password' },
    });
    pipe.capture({
      actor: 'bob',
      action: 'auth.login',
      resource: 'session:2',
      outcome: 'failure',
      details: { ip: '10.0.0.2', reason: 'bad password' },
    });
    pipe.capture({
      actor: 'alice',
      action: 'document.delete',
      resource: 'document:99',
      outcome: 'success',
      details: { path: '/docs/secret.pdf' },
    });
  });

  it('ranks matching records by relevance', () => {
    const hits = search.search(pipe.store.query({ limit: 100 }).records, 'login');
    expect(hits.length).toBe(2);
    // Both match 'login' in action; ordering by score then recency.
    expect(hits[0].record.action).toBe('auth.login');
    expect(hits[0].matchedTerms).toContain('login');
  });

  it('matches terms in details', () => {
    const hits = search.search(pipe.store.query({ limit: 100 }).records, 'secret.pdf');
    expect(hits.length).toBe(1);
    expect(hits[0].record.action).toBe('document.delete');
  });

  it('prefers records matching more terms', () => {
    const recs = pipe.store.query({ limit: 100 }).records;
    const hits = search.search(recs, 'alice login');
    expect(hits[0].record.actor).toBe('alice');
    expect(hits[0].matchedTerms.sort()).toEqual(['alice', 'login']);
  });

  it('phrase queries get a bonus', () => {
    const recs = pipe.store.query({ limit: 100 }).records;
    const hits = search.search(recs, '"bad password"');
    expect(hits.length).toBe(1);
    expect(hits[0].record.actor).toBe('bob');
  });

  it('parses quoted phrases out of mixed queries', () => {
    const parsed = parseSearchQuery('alice "session:2" login');
    expect(parsed.phrases).toEqual(['session:2']);
    expect(parsed.terms).toEqual(['alice', 'login']);
  });

  it('respects tenant and severity filters', () => {
    const recs = pipe.store.query({ limit: 100 }).records;
    const hits = search.search(recs, 'login', { minSeverity: 'error' });
    expect(hits.length).toBe(0);
  });

  it('caps results via limit', () => {
    const recs = pipe.store.query({ limit: 100 }).records;
    const hits = search.search(recs, 'a', { limit: 1 });
    expect(hits.length).toBeLessThanOrEqual(1);
  });
});

describe('LogShipper', () => {
  let clock: FakeClock;
  let sink: InMemoryLogSink2;
  let shipper: LogShipper;
  let seq = 0;

  function rec(): AuditRecord {
    seq++;
    return {
      seq,
      id: `r${seq}`,
      timestamp: clock.now(),
      actor: 'a',
      action: 'x.y',
      outcome: 'success',
      severity: 'info',
      details: {},
      previousHash: 'h',
      hash: 'h',
      tier: 'hot',
    };
  }

  beforeEach(() => {
    clock = new FakeClock();
    sink = new InMemoryLogSink2();
    shipper = new LogShipper(sink, {
      maxBatchBytes: 500,
      maxDelayMs: 1000,
      maxBufferedBytes: 10_000,
      clock,
    });
    seq = 0;
  });

  it('flushes when size threshold is reached', async () => {
    while (shipper.stats.bufferedBytes < 500) {
      expect(shipper.enqueue(rec())).toBe(true);
    }
    await shipper.flush();
    expect(sink.batches.length).toBeGreaterThan(0);
    expect(shipper.stats.shippedRecords).toBeGreaterThan(0);
  });

  it('flushes on time via tick', async () => {
    shipper.enqueue(rec());
    clock.advance(999);
    shipper.tick();
    expect(sink.batches.length).toBe(0);
    clock.advance(2);
    shipper.tick();
    await shipper.flush();
    expect(sink.batches.length).toBe(1);
  });

  it('applies backpressure when buffer cap is hit', () => {
    const tiny = new LogShipper(sink, {
      maxBatchBytes: 100_000_000,
      maxDelayMs: 1_000_000,
      maxBufferedBytes: 300,
      clock,
    });
    let refused = 0;
    for (let i = 0; i < 50; i++) {
      if (!tiny.enqueue(rec())) refused++;
    }
    expect(refused).toBeGreaterThan(0);
    expect(tiny.stats.refusedEnqueues).toBe(refused);
  });

  it('retries failed ships and preserves order', async () => {
    shipper.enqueue(rec());
    shipper.enqueue(rec());
    sink.failNextTimes = 1;
    await shipper.flush();
    // First attempt failed → batch requeued, backoff set
    expect(shipper.stats.retries).toBe(1);
    expect(sink.batches.length).toBe(0);
    clock.advance(1000);
    await shipper.flush();
    expect(sink.batches.length).toBe(1);
    expect(sink.batches[0].records.length).toBe(2);
    expect(sink.batches[0].records[0].id).toBe('r1');
  });

  it('drops batch after maxRetries', async () => {
    const dropper = new LogShipper(sink, {
      maxBatchBytes: 500,
      maxDelayMs: 1000,
      maxBufferedBytes: 10_000,
      maxRetries: 1,
      clock,
    });
    dropper.enqueue(rec());
    sink.failNextTimes = 5;
    await dropper.flush();
    clock.advance(10_000);
    await dropper.flush();
    expect(dropper.stats.droppedRecords).toBe(1);
  });
});

describe('RetentionSimulator', () => {
  const policy: RetentionPolicy = {
    tiers: [
      { name: 'hot', maxAgeMs: 1000, next: 'warm' },
      { name: 'warm', maxAgeMs: 5000, next: 'cold' },
      { name: 'cold', maxAgeMs: 50_000, next: 'frozen' },
    ],
    purgeAfterMs: 100_000,
  };
  const sim = new RetentionSimulator();

  function fakeRec(id: string, tier: AuditRecord['tier'], ts: number): AuditRecord {
    return {
      seq: Number(id.replace(/\D/g, '')) || 1,
      id,
      timestamp: ts,
      actor: 'a',
      action: 'x',
      outcome: 'success',
      severity: 'info',
      details: {},
      previousHash: 'h',
      hash: 'h',
      tier,
    };
  }

  it('plans keep/promote/purge per record', () => {
    const now = 200_000;
    const records = [
      fakeRec('r1', 'hot', now - 500), // young hot → keep
      fakeRec('r2', 'hot', now - 2000), // aged hot → promote to warm
      fakeRec('r3', 'warm', now - 90_000), // under purge age → promote (warm→cold)
      fakeRec('r4', 'cold', now - 150_000), // past purgeAfterMs → purge
    ];
    const report = sim.simulate(records, policy, [], now);
    const byId = new Map(report.plans.map((p) => [p.recordId, p]));
    expect(byId.get('r1')?.action).toBe('keep');
    expect(byId.get('r2')?.action).toBe('promote');
    expect(byId.get('r2')?.targetTier).toBe('warm');
    expect(byId.get('r3')?.action).toBe('promote');
    expect(byId.get('r3')?.targetTier).toBe('cold');
    expect(byId.get('r4')?.action).toBe('purge');
    expect(report.wouldPurge).toBe(1);
    expect(report.bytesFreed).toBeGreaterThan(0);
  });

  it('legal holds block purge', () => {
    const now = 200_000;
    const records = [fakeRec('r9', 'cold', now - 150_000)];
    const hold: LegalHold = {
      id: 'hold-1',
      reason: 'litigation',
      createdAt: 0,
      filter: { actor: 'a' },
    };
    const report = sim.simulate(records, policy, [hold], now);
    expect(report.plans[0].action).toBe('hold');
    expect(report.plans[0].holdId).toBe('hold-1');
    expect(report.wouldPurge).toBe(0);
    expect(report.activeHolds).toEqual(['hold-1']);
  });

  it('compare shows delta between policies', () => {
    const now = 200_000;
    const records = [fakeRec('r1', 'hot', now - 60_000), fakeRec('r2', 'hot', now - 150_000)];
    const aggressive: RetentionPolicy = { ...policy, purgeAfterMs: 50_000 };
    const cmp = sim.compare(records, policy, aggressive, [], now);
    expect(cmp.purgeDelta).toBe(1);
    expect(cmp.newlyPurged).toEqual(['r1']);
    expect(cmp.candidate.wouldPurge).toBe(2);
    expect(cmp.current.wouldPurge).toBe(1);
  });

  it('does not mutate the store', () => {
    const clock = new FakeClock();
    const pipe = new AuditPipeline({ clock });
    pipe.capture({ actor: 'a', action: 'x', outcome: 'success' });
    const before = pipe.store.query({ limit: 10 }).records.length;
    sim.simulateStore(pipe.store, { tiers: [], purgeAfterMs: 0 }, [], clock.now() + 1e9);
    expect(pipe.store.query({ limit: 10 }).records.length).toBe(before);
  });
});

describe('SessionCorrelator', () => {
  const corr = new SessionCorrelator({ gapMs: 1000 });
  let clock: FakeClock;
  let pipe: AuditPipeline;

  beforeEach(() => {
    clock = new FakeClock();
    pipe = new AuditPipeline({ clock });
  });

  it('groups records by correlationId into ordered chains', () => {
    pipe.capture({ actor: 'a', action: 'start', correlationId: 'c1', outcome: 'success' });
    pipe.capture({ actor: 'a', action: 'mid', correlationId: 'c1', outcome: 'success' });
    pipe.capture({ actor: 'b', action: 'unrelated', outcome: 'success' });
    pipe.capture({ actor: 'a', action: 'end', correlationId: 'c1', outcome: 'failure' });
    const recs = pipe.store.query({ limit: 10 }).records;
    const chains = corr.correlate(recs);
    expect(chains.length).toBe(1);
    expect(chains[0].records.length).toBe(3);
    expect(chains[0].records.map((r) => r.action)).toEqual(['start', 'mid', 'end']);
    expect(chains[0].failures).toBe(1);
  });

  it('splits an actor\'s activity into sessions at the gap', () => {
    pipe.capture({ actor: 'u', action: 'a1', outcome: 'success' });
    pipe.capture({ actor: 'u', action: 'a2', outcome: 'success' });
    clock.advance(500); // within gap
    pipe.capture({ actor: 'u', action: 'a3', outcome: 'success' });
    clock.advance(2000); // beyond 1s gap → new session
    pipe.capture({ actor: 'u', action: 'b1', outcome: 'success' });
    const recs = pipe.store.query({ limit: 10 }).records;
    const sessions = corr.sessionsFor('u', recs);
    expect(sessions.length).toBe(2);
    expect(sessions[0].records.length).toBe(3);
    expect(sessions[1].records.length).toBe(1);
    expect(sessions[0].topActions[0].action).toBe('a1');
  });

  it('aggregates sessions for all actors', () => {
    pipe.capture({ actor: 'x', action: 'a', outcome: 'success' });
    pipe.capture({ actor: 'y', action: 'b', outcome: 'success' });
    const recs = pipe.store.query({ limit: 10 }).records;
    const all = corr.sessions(recs);
    expect(all.length).toBe(2);
  });

  it('chainFor returns the single correlation chain', () => {
    pipe.capture({ actor: 'a', action: 'x', correlationId: 'xyz', outcome: 'success' });
    const recs = pipe.store.query({ limit: 10 }).records;
    const chain = corr.chainFor(recs, 'xyz');
    expect(chain?.records.length).toBe(1);
    expect(corr.chainFor(recs, 'missing')).toBeNull();
  });

  it('reports maxSeverity and failures per session', () => {
    pipe.capture({ actor: 'u', action: 'ok', outcome: 'success', severity: 'info' });
    pipe.capture({ actor: 'u', action: 'bad', outcome: 'failure', severity: 'error' });
    const recs = pipe.store.query({ limit: 10 }).records;
    const s = corr.sessionsFor('u', recs)[0];
    expect(s.maxSeverity).toBe('error');
    expect(s.failures).toBe(1);
  });
});
