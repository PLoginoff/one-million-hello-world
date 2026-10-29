import { describe, it, expect, beforeEach } from 'bun:test';
import { DataClassificationEngine } from '../engines/DataClassificationEngine';
import { AccessReviewEngine } from '../engines/AccessReviewEngine';
import { PolicyExceptionEngine } from '../engines/PolicyExceptionEngine';
import { RetentionEngine } from '../engines/RetentionEngine';
import { DsarEngine } from '../engines/DsarEngine';
import { ComplianceControlEngine } from '../engines/ComplianceControlEngine';
import {
  ClassificationTier,
  CampaignStatus,
  ReviewDecision,
  ExceptionStatus,
  DispositionAction,
  DsarState,
  DsarKind,
  ControlStatus,
  TestClock,
  DAY_MS,
} from '../engines/types';

describe('DataClassificationEngine', () => {
  let engine: DataClassificationEngine;

  beforeEach(() => {
    engine = new DataClassificationEngine(new TestClock(1000));
    engine.addRule({
      id: 'r-pii',
      name: 'PII fields',
      field: 'data-type',
      pattern: 'pii',
      regex: false,
      tier: ClassificationTier.Restricted,
      priority: 10,
    });
    engine.addRule({
      id: 'r-fin',
      name: 'Financial',
      field: 'data-type',
      pattern: 'financial',
      regex: false,
      tier: ClassificationTier.Confidential,
      priority: 20,
    });
  });

  it('classifies resources via first matching rule', () => {
    const r = engine.classify('res-1', { 'data-type': 'customer-pii' });
    expect(r.tier).toBe(ClassificationTier.Restricted);
    expect(r.matchedRuleId).toBe('r-pii');
  });

  it('defaults to internal when no rule matches', () => {
    const r = engine.classify('res-2', { 'data-type': 'logs' });
    expect(r.tier).toBe(ClassificationTier.Internal);
    expect(r.matchedRuleId).toBeNull();
  });

  it('higher-priority rule wins over lower priority', () => {
    const r = engine.classify('res-3', { 'data-type': 'pii-financial' });
    expect(r.tier).toBe(ClassificationTier.Restricted); // priority 10 < 20
  });

  it('supports regex patterns', () => {
    engine.addRule({
      id: 'r-ssn',
      name: 'SSN-like names',
      field: '*',
      pattern: '^db-ssn-',
      regex: true,
      tier: ClassificationTier.Restricted,
      priority: 5,
    });
    expect(engine.classify('db-ssn-prod').tier).toBe(ClassificationTier.Restricted);
    expect(engine.classify('db-users').tier).toBe(ClassificationTier.Internal);
  });

  it('fails closed: same-priority match picks more restrictive tier', () => {
    engine.addRule({
      id: 'r-dup-internal',
      name: 'dup',
      field: 'data-type',
      pattern: 'mixed',
      regex: false,
      tier: ClassificationTier.Internal,
      priority: 10, // same as r-pii which won't match 'mixed' — add matching one
    });
    engine.addRule({
      id: 'r-dup-conf',
      name: 'dup2',
      field: 'data-type',
      pattern: 'mixed',
      regex: false,
      tier: ClassificationTier.Confidential,
      priority: 10,
    });
    const r = engine.classify('res-4', { 'data-type': 'mixed' });
    expect(r.tier).toBe(ClassificationTier.Confidential);
  });

  it('manual override beats rules and survives re-classification', () => {
    engine.setOverride('res-5', ClassificationTier.Public);
    const r = engine.classify('res-5', { 'data-type': 'pii' });
    expect(r.tier).toBe(ClassificationTier.Public);
    expect(r.manualOverride).toBe(true);
  });

  it('rejects duplicate rule ids and invalid regex at registration', () => {
    expect(() =>
      engine.addRule({
        id: 'r-pii',
        name: 'dup',
        field: 'x',
        pattern: 'x',
        regex: false,
        tier: ClassificationTier.Public,
        priority: 1,
      })
    ).toThrow();
    expect(() =>
      engine.addRule({
        id: 'r-bad',
        name: 'bad',
        field: 'x',
        pattern: '(',
        regex: true,
        tier: ClassificationTier.Public,
        priority: 1,
      })
    ).toThrow();
  });

  it('exposes per-tier handling rules and sharing scopes', () => {
    expect(engine.isSharingAllowed(ClassificationTier.Public, 'public')).toBe(true);
    expect(engine.isSharingAllowed(ClassificationTier.Restricted, 'public')).toBe(false);
    expect(engine.isSharingAllowed(ClassificationTier.Restricted, 'named-users')).toBe(true);
    expect(engine.getHandlingRules(ClassificationTier.Restricted).requiresDualControl).toBe(true);
  });
});

describe('AccessReviewEngine', () => {
  let clock: TestClock;
  let engine: AccessReviewEngine;

  beforeEach(() => {
    clock = new TestClock(0);
    engine = new AccessReviewEngine(clock);
  });

  function makeCampaign(deadline: number = 7 * DAY_MS) {
    const c = engine.createCampaign(
      'Q4 review',
      [
        { subjectId: 'alice', grant: 'admin', reviewerId: 'bob' },
        { subjectId: 'carol', grant: 'read-pii', reviewerId: 'bob' },
        { subjectId: 'dave', grant: 'dev', reviewerId: 'erin' },
      ],
      deadline
    );
    engine.activate(c.id);
    return c;
  }

  it('certifies and revokes entries', () => {
    const c = makeCampaign();
    engine.decide(c.id, 'alice', 'admin', 'bob', ReviewDecision.Certified);
    engine.decide(c.id, 'carol', 'read-pii', 'bob', ReviewDecision.Revoked, 'no longer needed');
    const s = engine.summarize(c.id);
    expect(s.certified).toBe(1);
    expect(s.revoked).toBe(1);
    expect(s.pending).toBe(1);
  });

  it('rejects decisions from the wrong reviewer', () => {
    const c = makeCampaign();
    expect(() =>
      engine.decide(c.id, 'alice', 'admin', 'mallory', ReviewDecision.Certified)
    ).toThrow();
  });

  it('enforces segregation of duties — no self-certification', () => {
    const c = engine.createCampaign(
      'SoD test',
      [{ subjectId: 'alice', grant: 'admin', reviewerId: 'alice' }],
      7 * DAY_MS
    );
    engine.activate(c.id);
    expect(() =>
      engine.decide(c.id, 'alice', 'admin', 'alice', ReviewDecision.Certified)
    ).toThrow();
    // But she can be reassigned and another reviewer can certify
    engine.reassign(c.id, 'alice', 'admin', 'bob');
    engine.decide(c.id, 'alice', 'admin', 'bob', ReviewDecision.Certified);
    expect(engine.summarize(c.id).certified).toBe(1);
  });

  it('requires activation before decisions', () => {
    const c = engine.createCampaign(
      'draft',
      [{ subjectId: 'a', grant: 'g', reviewerId: 'r' }],
      7 * DAY_MS
    );
    expect(() => engine.decide(c.id, 'a', 'g', 'r', ReviewDecision.Certified)).toThrow();
  });

  it('auto-revokes pending entries on close (fail closed)', () => {
    const c = makeCampaign();
    engine.decide(c.id, 'alice', 'admin', 'bob', ReviewDecision.Certified);
    const autoRevoked = engine.close(c.id);
    expect(autoRevoked).toBe(2);
    const s = engine.summarize(c.id);
    expect(s.status).toBe(CampaignStatus.Closed);
    expect(s.revoked).toBe(2);
    expect(s.completionPct).toBe(100);
  });

  it('reports overdue pending entries after deadline', () => {
    const c = makeCampaign(5 * DAY_MS);
    clock.advance(6 * DAY_MS);
    const overdue = engine.overdueEntries();
    expect(overdue.length).toBe(3);
    expect(overdue[0]!.campaignId).toBe(c.id);
    expect(engine.summarize(c.id).overdue).toBe(3);
  });
});

describe('PolicyExceptionEngine', () => {
  let clock: TestClock;
  let engine: PolicyExceptionEngine;

  beforeEach(() => {
    clock = new TestClock(0);
    engine = new PolicyExceptionEngine(clock);
  });

  it('activates after required approvals', () => {
    const ex = engine.request('pol-1', 'req-1', 'needed for migration', 2, 30 * DAY_MS);
    engine.approve(ex.id, 'app-1');
    expect(engine.get(ex.id)!.status).toBe(ExceptionStatus.PendingApproval);
    engine.approve(ex.id, 'app-2');
    expect(engine.get(ex.id)!.status).toBe(ExceptionStatus.Approved);
    expect(engine.isExcepted('pol-1')).toBe(true);
  });

  it('prevents self-approval and double approval', () => {
    const ex = engine.request('pol-1', 'req-1', 'j', 2, 30 * DAY_MS);
    expect(() => engine.approve(ex.id, 'req-1')).toThrow();
    engine.approve(ex.id, 'app-1');
    expect(() => engine.approve(ex.id, 'app-1')).toThrow();
  });

  it('single rejection vetoes', () => {
    const ex = engine.request('pol-1', 'req-1', 'j', 2, 30 * DAY_MS);
    engine.approve(ex.id, 'app-1');
    engine.reject(ex.id, 'app-2');
    expect(engine.get(ex.id)!.status).toBe(ExceptionStatus.Rejected);
    expect(engine.isExcepted('pol-1')).toBe(false);
  });

  it('expires approved exceptions after expiry time', () => {
    const ex = engine.request('pol-1', 'req-1', 'j', 1, 10 * DAY_MS);
    engine.approve(ex.id, 'app-1');
    expect(engine.isExcepted('pol-1')).toBe(true);
    clock.advance(11 * DAY_MS);
    expect(engine.isExcepted('pol-1')).toBe(false);
    expect(engine.get(ex.id)!.status).toBe(ExceptionStatus.Expired);
  });

  it('rejects requests with past expiry', () => {
    expect(() => engine.request('p', 'r', 'j', 1, -1)).toThrow();
  });
});

describe('RetentionEngine', () => {
  let clock: TestClock;
  let engine: RetentionEngine;

  beforeEach(() => {
    clock = new TestClock(100 * DAY_MS);
    engine = new RetentionEngine(clock);
    engine.addSchedule({ id: 's-logs', category: 'logs', retentionDays: 30, disposition: 'delete' });
    engine.addSchedule({ id: 's-fin', category: 'financial', retentionDays: 2555, disposition: 'archive' });
  });

  it('retains resources within the retention window', () => {
    engine.registerResource({ resourceId: 'log-1', category: 'logs', createdAt: 90 * DAY_MS });
    const d = engine.evaluate('log-1');
    expect(d.action).toBe(DispositionAction.Retain);
    expect(d.scheduleId).toBe('s-logs');
  });

  it('deletes resources past retention', () => {
    engine.registerResource({ resourceId: 'log-2', category: 'logs', createdAt: 10 * DAY_MS });
    expect(engine.evaluate('log-2').action).toBe(DispositionAction.Delete);
  });

  it('legal hold overrides elapsed retention until released', () => {
    engine.registerResource({ resourceId: 'log-3', category: 'logs', createdAt: 0 });
    engine.placeHold('log-3', 'hold-1');
    expect(engine.evaluate('log-3').action).toBe(DispositionAction.LegalHold);
    engine.releaseHold('log-3', 'hold-1');
    expect(engine.evaluate('log-3').action).toBe(DispositionAction.Delete);
  });

  it('keeps hold while any of multiple holds remain', () => {
    engine.registerResource({ resourceId: 'r', category: 'logs', createdAt: 0 });
    engine.placeHold('r', 'h1');
    engine.placeHold('r', 'h2');
    engine.releaseHold('r', 'h1');
    expect(engine.isHeld('r')).toBe(true);
    engine.releaseHold('r', 'h2');
    expect(engine.isHeld('r')).toBe(false);
  });

  it('longest retention wins among matching schedules', () => {
    engine.addSchedule({ id: 's-logs-long', category: 'logs', retentionDays: 90, disposition: 'archive' });
    const s = engine.effectiveSchedule('logs');
    expect(s!.id).toBe('s-logs-long');
    engine.registerResource({ resourceId: 'log-4', category: 'logs', createdAt: 20 * DAY_MS });
    // 80 days old: past 30d schedule, inside 90d
    expect(engine.evaluate('log-4').action).toBe(DispositionAction.Retain);
  });

  it('groups evaluateAll by action', () => {
    engine.registerResource({ resourceId: 'a', category: 'logs', createdAt: 0 });
    engine.registerResource({ resourceId: 'b', category: 'logs', createdAt: 99 * DAY_MS });
    engine.registerResource({ resourceId: 'c', category: 'unknown', createdAt: 0 });
    const { byAction } = engine.evaluateAll();
    expect(byAction.get(DispositionAction.Delete)).toEqual(['a']);
    expect(byAction.get(DispositionAction.Retain)).toContain('b');
    expect(byAction.get(DispositionAction.Retain)).toContain('c');
  });
});

describe('DsarEngine', () => {
  let clock: TestClock;
  let engine: DsarEngine;

  beforeEach(() => {
    clock = new TestClock(0);
    engine = new DsarEngine(clock);
  });

  it('walks the happy path to completion', () => {
    const r = engine.submit('subj-1', DsarKind.Access, 30);
    expect(engine.transition(r.id, DsarState.IdentityVerification, 'agent')).toBe(true);
    expect(engine.transition(r.id, DsarState.InProgress, 'agent')).toBe(true);
    expect(engine.transition(r.id, DsarState.AwaitingResponse, 'agent')).toBe(true);
    expect(engine.transition(r.id, DsarState.Completed, 'agent')).toBe(true);
    expect(engine.get(r.id)!.completedAt).not.toBeNull();
  });

  it('rejects illegal transitions without writing history', () => {
    const r = engine.submit('subj-1', DsarKind.Erasure, 30);
    expect(engine.transition(r.id, DsarState.Completed, 'agent')).toBe(false);
    expect(engine.get(r.id)!.state).toBe(DsarState.Submitted);
    expect(engine.history(r.id).length).toBe(0);
  });

  it('allows skipping identity verification', () => {
    const r = engine.submit('subj-1', DsarKind.Access, 30);
    expect(engine.transition(r.id, DsarState.InProgress, 'agent')).toBe(true);
  });

  it('rejection is reachable from any non-terminal state and terminal', () => {
    const r = engine.submit('s', DsarKind.Access, 30);
    engine.transition(r.id, DsarState.InProgress, 'a');
    expect(engine.transition(r.id, DsarState.Rejected, 'a', 'bad faith')).toBe(true);
    expect(engine.transition(r.id, DsarState.Completed, 'a')).toBe(false);
  });

  it('records full audit history', () => {
    const r = engine.submit('s', DsarKind.Access, 30);
    engine.transition(r.id, DsarState.InProgress, 'agent-1', 'verified');
    const h = engine.history(r.id);
    expect(h.length).toBe(1);
    expect(h[0]!.actorId).toBe('agent-1');
    expect(h[0]!.from).toBe(DsarState.Submitted);
  });

  it('flags overdue and due-soon requests', () => {
    const r1 = engine.submit('s1', DsarKind.Access, 30);
    engine.submit('s2', DsarKind.Access, 60);
    clock.advance(31 * DAY_MS);
    const overdue = engine.overdue();
    expect(overdue.map((r) => r.id)).toEqual([r1.id]);
    const soon = engine.dueSoon(30 * DAY_MS);
    expect(soon.length).toBe(1); // s2 due at 60d, now 31d → within 30d
  });
});

describe('ComplianceControlEngine', () => {
  let clock: TestClock;
  let engine: ComplianceControlEngine;

  beforeEach(() => {
    clock = new TestClock(1000);
    engine = new ComplianceControlEngine(clock, 2); // need 2 fresh evidence for compliant
  });

  it('is not-assessed with no evidence', () => {
    engine.registerControl({ id: 'c1', frameworkRef: 'SOC2-CC6.1', title: 'Access control' });
    expect(engine.assess('c1').status).toBe(ControlStatus.NotAssessed);
  });

  it('is partial with evidence below threshold', () => {
    engine.registerControl({ id: 'c1', frameworkRef: 'SOC2-CC6.1', title: 't' });
    engine.addEvidence('c1', { title: 'e1', reference: 'doc://1', validUntil: null });
    expect(engine.assess('c1').status).toBe(ControlStatus.Partial);
  });

  it('is compliant when fresh evidence meets threshold', () => {
    engine.registerControl({ id: 'c1', frameworkRef: 'SOC2-CC6.1', title: 't' });
    engine.addEvidence('c1', { title: 'e1', reference: 'd1', validUntil: null });
    engine.addEvidence('c1', { title: 'e2', reference: 'd2', validUntil: null });
    expect(engine.assess('c1').status).toBe(ControlStatus.Compliant);
  });

  it('stale evidence does not count toward compliance', () => {
    engine.registerControl({ id: 'c1', frameworkRef: 'SOC2-CC6.1', title: 't' });
    engine.addEvidence('c1', { title: 'e1', reference: 'd1', validUntil: 500 }); // stale at now=1000
    engine.addEvidence('c1', { title: 'e2', reference: 'd2', validUntil: null });
    const a = engine.assess('c1');
    expect(a.status).toBe(ControlStatus.Partial);
    expect(a.staleEvidenceCount).toBe(1);
  });

  it('all-stale evidence means non-compliant', () => {
    engine.registerControl({ id: 'c1', frameworkRef: 'SOC2-CC6.1', title: 't' });
    engine.addEvidence('c1', { title: 'e', reference: 'd', validUntil: 100 });
    expect(engine.assess('c1').status).toBe(ControlStatus.NonCompliant);
  });

  it('aggregates coverage per framework', () => {
    const e2 = new ComplianceControlEngine(clock, 1);
    e2.registerControl({ id: 'a', frameworkRef: 'SOC2-CC6.1', title: 't' });
    e2.registerControl({ id: 'b', frameworkRef: 'SOC2-CC7.1', title: 't' });
    e2.registerControl({ id: 'c', frameworkRef: 'GDPR-Art32', title: 't' });
    e2.addEvidence('a', { title: 'e', reference: 'r', validUntil: null });
    const report = e2.coverage('SOC2');
    expect(report.totalControls).toBe(2);
    expect(report.compliancePct).toBe(50);
    expect(e2.frameworks()).toEqual(['GDPR', 'SOC2']);
  });
});
