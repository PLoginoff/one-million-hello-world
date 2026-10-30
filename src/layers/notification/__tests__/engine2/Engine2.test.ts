/**
 * Notification engine2 tests — policy matrix, escalation, template tree.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import type { Clock } from '../../delivery/NotificationTypes';
import {
  EscalationChain,
  PolicyMatrix,
  standardEscalation,
  TemplateCycleError,
  TemplateNotFoundError,
  TemplateTree,
} from '../../engine2';

const HOUR = 3_600_000;

function fakeClock(start = Date.UTC(2024, 0, 1, 12)): Clock & { advance: (ms: number) => void; set: (t: number) => void } {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => void (t += ms),
    set: (v: number) => void (t = v),
  };
}

// --------------------------------------------------------- policy matrix

describe('PolicyMatrix', () => {
  let clock: ReturnType<typeof fakeClock>;
  let pm: PolicyMatrix;

  beforeEach(() => {
    clock = fakeClock();
    pm = new PolicyMatrix(clock);
  });

  it('defaults to allow when no policy is set', () => {
    expect(pm.resolve('u', 'any', 'email').kind).toBe('allow');
  });

  it('deny beats everything except critical', () => {
    pm.setPolicy({
      userId: 'u',
      topicPrefs: { billing: { email: 'deny' } },
    });
    expect(pm.resolve('u', 'billing', 'email').kind).toBe('deny');
    expect(pm.resolve('u', 'billing', 'sms').kind).toBe('allow'); // not denied
  });

  it('defaultPrefs row fills the gaps', () => {
    pm.setPolicy({
      userId: 'u',
      topicPrefs: {},
      defaultPrefs: { sms: 'deny' },
    });
    expect(pm.resolve('u', 'unknown-topic', 'sms').kind).toBe('deny');
    expect(pm.resolve('u', 'unknown-topic', 'email').kind).toBe('allow');
  });

  it('quiet hours defer non-critical traffic', () => {
    pm.setPolicy({
      userId: 'u',
      topicPrefs: {},
      // quiet 22:00-07:00; fakeClock starts at 12:00 → set to 23:00
      quietHours: { startHour: 22, endHour: 7 },
    });
    clock.set(Date.UTC(2024, 0, 1, 23));
    const v = pm.resolve('u', 'marketing', 'email');
    expect(v.kind).toBe('defer');
    if (v.kind === 'defer') {
      expect(v.untilMs).toBeGreaterThan(clock.now());
    }
  });

  it('critical topics punch through quiet hours and rate limits', () => {
    pm.setPolicy({
      userId: 'u',
      topicPrefs: {},
      quietHours: { startHour: 22, endHour: 7 },
      maxPerHour: 1,
      criticalTopics: ['security'],
    });
    clock.set(Date.UTC(2024, 0, 1, 23));
    // Burn the hourly budget.
    pm.resolve('u', 'x', 'email');
    // 'security' still allowed despite quiet + exhausted budget.
    expect(pm.resolve('u', 'security', 'email').kind).toBe('allow');
  });

  it('rate-limits after maxPerHour sends', () => {
    pm.setPolicy({ userId: 'u', topicPrefs: {}, maxPerHour: 2 });
    expect(pm.resolve('u', 't', 'email').kind).toBe('allow');
    expect(pm.resolve('u', 't', 'email').kind).toBe('allow');
    const third = pm.resolve('u', 't', 'email');
    expect(third.kind).toBe('rate-limited');
    if (third.kind === 'rate-limited') {
      expect(third.retryAfterMs).toBeGreaterThan(0);
    }
  });

  it('sliding window frees budget as sends age out', () => {
    pm.setPolicy({ userId: 'u', topicPrefs: {}, maxPerHour: 1 });
    pm.resolve('u', 't', 'email');
    expect(pm.resolve('u', 't', 'email').kind).toBe('rate-limited');
    clock.advance(HOUR + 1);
    expect(pm.resolve('u', 't', 'email').kind).toBe('allow');
  });

  it('denied sends do not consume rate budget', () => {
    pm.setPolicy({
      userId: 'u',
      topicPrefs: { blocked: { email: 'deny' } },
      maxPerHour: 1,
    });
    pm.resolve('u', 'blocked', 'email');
    pm.resolve('u', 'blocked', 'email');
    expect(pm.resolve('u', 'ok-topic', 'email').kind).toBe('allow');
  });

  it('digest preference returns a digest verdict with interval', () => {
    pm.setPolicy({
      userId: 'u',
      topicPrefs: { news: { email: 'digest' } },
      digestEveryMs: 3_600_000,
    });
    const v = pm.resolve('u', 'news', 'email');
    expect(v.kind).toBe('digest');
    if (v.kind === 'digest') expect(v.everyMs).toBe(3_600_000);
  });

  it('priority ≥10 bypasses quiet hours but not deny', () => {
    pm.setPolicy({
      userId: 'u',
      topicPrefs: { important: { email: 'allow' }, blocked: { email: 'deny' } },
      quietHours: { startHour: 22, endHour: 7 },
    });
    clock.set(Date.UTC(2024, 0, 1, 23));
    expect(pm.resolve('u', 'important', 'email', 10).kind).toBe('allow');
    expect(pm.resolve('u', 'blocked', 'email', 10).kind).toBe('deny');
  });

  it('remainingBudget reports sends left', () => {
    pm.setPolicy({ userId: 'u', topicPrefs: {}, maxPerHour: 3 });
    expect(pm.remainingBudget('u')).toBe(3);
    pm.resolve('u', 't', 'email');
    expect(pm.remainingBudget('u')).toBe(2);
  });
});

// --------------------------------------------------------- escalation

describe('EscalationChain', () => {
  let clock: ReturnType<typeof fakeClock>;
  let chain: EscalationChain;

  beforeEach(() => {
    clock = fakeClock();
    chain = new EscalationChain(clock);
    chain.registerPlan(standardEscalation());
  });

  it('begins on the first channel', () => {
    const s = chain.begin('n1', 'standard');
    expect(s.nextChannel).toBe('push');
    expect(s.stepIndex).toBe(0);
    expect(s.exhausted).toBe(false);
  });

  it('retries same channel up to maxAttempts then falls to next', () => {
    chain.begin('n1', 'standard');
    chain.recordOutcome('n1', 'retryable-failure'); // attempt 1 on push
    let s = chain.state('n1')!;
    expect(s.nextChannel).toBe('push');
    expect(s.attemptOnStep).toBe(1);

    clock.advance(30_000);
    chain.recordOutcome('n1', 'retryable-failure'); // attempt 2 — maxAttempts hit
    s = chain.state('n1')!;
    expect(s.nextChannel).toBe('sms');
    expect(s.stepIndex).toBe(1);
  });

  it('terminal failure skips remaining attempts on that channel', () => {
    chain.begin('n1', 'standard');
    chain.recordOutcome('n1', 'terminal-failure');
    expect(chain.state('n1')!.nextChannel).toBe('sms');
  });

  it('no-target falls through immediately', () => {
    chain.begin('n1', 'standard');
    chain.recordOutcome('n1', 'no-target'); // user has no push token
    expect(chain.state('n1')!.nextChannel).toBe('sms');
  });

  it('sent ends the chain', () => {
    chain.begin('n1', 'standard');
    const s = chain.recordOutcome('n1', 'sent');
    expect(s.exhausted).toBe(true);
    expect(s.nextChannel).toBeUndefined();
  });

  it('exhausts after the last step fails', () => {
    chain.begin('n1', 'standard');
    // push ×2, sms ×2, email ×1, webhook ×1
    for (let i = 0; i < 2; i++) chain.recordOutcome('n1', 'retryable-failure');
    for (let i = 0; i < 2; i++) chain.recordOutcome('n1', 'retryable-failure');
    chain.recordOutcome('n1', 'retryable-failure'); // email done
    chain.recordOutcome('n1', 'retryable-failure'); // webhook done
    expect(chain.state('n1')!.exhausted).toBe(true);
  });

  it('dueNow lists notifications ready for their next attempt', () => {
    chain.begin('n1', 'standard');
    chain.recordOutcome('n1', 'retryable-failure'); // retry in 30s
    expect(chain.dueNow()).toEqual([]);
    clock.advance(31_000);
    expect(chain.dueNow()).toEqual(['n1']);
  });

  it('tracks multiple notifications independently', () => {
    chain.begin('n1', 'standard');
    chain.begin('n2', 'standard');
    chain.recordOutcome('n1', 'terminal-failure');
    expect(chain.state('n1')!.nextChannel).toBe('sms');
    expect(chain.state('n2')!.nextChannel).toBe('push');
  });
});

// --------------------------------------------------------- template tree

describe('TemplateTree', () => {
  let tree: TemplateTree;

  beforeEach(() => {
    tree = new TemplateTree();
    tree.registerAll([
      { key: 'alert', fragment: { subject: 'ALERT: {{name}}', body: 'Long body about {{name}}' } },
      { key: 'alert.sms', parentKey: 'alert', fragment: { body: 'SMS: {{name}}' } },
      { key: 'alert.sms.eu', parentKey: 'alert.sms', fragment: { subject: 'EU ALERT: {{name}}' } },
    ]);
  });

  it('child overrides only declared fields', () => {
    const r = tree.render('alert.sms', { name: 'X' });
    expect(r.subject).toBe('ALERT: X');   // inherited
    expect(r.body).toBe('SMS: X');        // overridden
  });

  it('grandchild inherits through the chain', () => {
    const r = tree.render('alert.sms.eu', { name: 'Y' });
    expect(r.subject).toBe('EU ALERT: Y'); // grandchild
    expect(r.body).toBe('SMS: Y');         // parent
    expect(r.lineage).toEqual(['alert', 'alert.sms', 'alert.sms.eu']);
  });

  it('root renders without a parent', () => {
    const r = tree.render('alert', { name: 'Z' });
    expect(r.subject).toBe('ALERT: Z');
    expect(r.body).toBe('Long body about Z');
  });

  it('renderWithFallback walks up the dot path', () => {
    // 'alert.push' isn't registered; falls back to 'alert'.
    const r = tree.renderWithFallback('alert.push', { name: 'W' });
    expect(r.subject).toBe('ALERT: W');
    expect(r.lineage).toEqual(['alert']);
  });

  it('throws on a cycle', () => {
    const t2 = new TemplateTree();
    t2.register({ key: 'a', parentKey: 'b', fragment: { subject: 'a' } });
    t2.register({ key: 'b', parentKey: 'a', fragment: { subject: 'b' } });
    expect(() => t2.resolve('a')).toThrow(TemplateCycleError);
  });

  it('throws on missing template and dangling parent', () => {
    expect(() => tree.resolve('nope')).toThrow(TemplateNotFoundError);
    const t2 = new TemplateTree();
    t2.register({ key: 'x', parentKey: 'ghost', fragment: { subject: 'x' } });
    expect(() => t2.resolve('x')).toThrow(TemplateNotFoundError);
  });
});
