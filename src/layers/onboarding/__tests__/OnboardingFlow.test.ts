/**
 * Onboarding flow engine — unit tests (bun:test)
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { FlowEngine } from '../flow/FlowEngine';
import { FlowGraph, assignVariant } from '../flow/FlowGraph';
import { RunStore } from '../flow/RunStore';
import { FunnelTracker } from '../flow/FunnelTracker';
import { ReminderScheduler, DEFAULT_CADENCE } from '../flow/ReminderScheduler';
import {
  Clock,
  FlowDefinition,
  FlowError,
  Predicates,
} from '../flow/FlowTypes';

function fakeClock(start = 0): Clock & { advance: (ms: number) => void } {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

const linear: FlowDefinition = {
  flowId: 'welcome',
  version: 1,
  start: 'a',
  steps: [
    { id: 'a', title: 'Account', next: 'b' },
    { id: 'b', title: 'Profile', skippable: true, next: 'c' },
    { id: 'c', title: 'Done' },
  ],
};

const branching: FlowDefinition = {
  flowId: 'signup',
  version: 1,
  start: 'plan',
  steps: [
    {
      id: 'plan', title: 'Choose plan',
      next: [
        { when: Predicates.eq('plan', 'enterprise'), to: 'sales' },
        { when: Predicates.eq('plan', 'pro'), to: 'payment' },
      ],
    },
    { id: 'sales', title: 'Talk to sales' },
    { id: 'payment', title: 'Enter card' },
    { id: 'confirm', title: 'Confirm' },
  ],
};

// ------------------------------------------------------------- FlowGraph

describe('FlowGraph', () => {
  it('validates: start must exist, no dup ids, edges resolvable', () => {
    expect(() => new FlowGraph({ flowId: 'f', version: 1, start: 'x', steps: [{ id: 'y', title: 'y' }] })).toThrow(FlowError);
    expect(() => new FlowGraph({ flowId: 'f', version: 1, start: 'a', steps: [
      { id: 'a', title: 'a' }, { id: 'a', title: 'a2' },
    ] })).toThrow(FlowError);
    expect(() => new FlowGraph({ flowId: 'f', version: 1, start: 'a', steps: [
      { id: 'a', title: 'a', next: 'zzz' },
    ] })).toThrow(FlowError);
  });

  it('variant stepOrder must permute all steps', () => {
    expect(() => new FlowGraph({
      flowId: 'f', version: 1, start: 'a',
      steps: [{ id: 'a', title: 'a' }, { id: 'b', title: 'b' }],
      variants: [{ variantId: 'v', weight: 0.5, stepOrder: ['a'] }],
    })).toThrow(FlowError);
  });

  it('requiredWhen filters steps from the resolved order', () => {
    const g = new FlowGraph({
      flowId: 'f', version: 1, start: 'a',
      steps: [
        { id: 'a', title: 'a', next: 'b' },
        { id: 'b', title: 'b', requiredWhen: Predicates.eq('pro', true), next: 'c' },
        { id: 'c', title: 'c' },
      ],
    });
    expect(g.resolveOrder(null, { pro: true })).toEqual(['a', 'b', 'c']);
    expect(g.resolveOrder(null, { pro: false })).toEqual(['a', 'c']);
  });

  it('assignVariant is deterministic and respects weights', () => {
    const def: FlowDefinition = {
      flowId: 'f', version: 1, start: 'a',
      steps: [{ id: 'a', title: 'a' }],
      variants: [{ variantId: 'treatment', weight: 0.5 }],
    };
    const seen = new Map<string | null, number>();
    for (let i = 0; i < 1000; i++) {
      const v = assignVariant(`user-${i}`, def);
      seen.set(v, (seen.get(v) ?? 0) + 1);
    }
    // ~half in treatment, half in control (null)
    expect(seen.get('treatment')!).toBeGreaterThan(300);
    expect(seen.get(null)!).toBeGreaterThan(300);
    // deterministic per user
    expect(assignVariant('user-1', def)).toBe(assignVariant('user-1', def));
  });
});

// ------------------------------------------------------------- FlowEngine basics

describe('FlowEngine', () => {
  let clock: ReturnType<typeof fakeClock>;
  let engine: FlowEngine;
  beforeEach(() => {
    clock = fakeClock(0);
    engine = new FlowEngine(clock);
    engine.registerFlow(linear);
    engine.registerFlow(branching);
  });

  it('walks a linear flow to completion', () => {
    const run = engine.start('welcome', 'u1');
    expect(engine.currentStep(run.runId)!.id).toBe('a');
    expect(engine.progress(run.runId)).toBe(0);
    engine.complete(run.runId);
    expect(engine.currentStep(run.runId)!.id).toBe('b');
    engine.skip(run.runId); // b is skippable
    expect(engine.currentStep(run.runId)!.id).toBe('c');
    engine.complete(run.runId);
    expect(run.state).toBe('completed');
    expect(engine.progress(run.runId)).toBe(1);
  });

  it('rejects skip on non-skippable steps', () => {
    const run = engine.start('welcome', 'u1');
    expect(() => engine.skip(run.runId)).toThrow(FlowError); // 'a' not skippable
  });

  it('branching: predicate picks the path', () => {
    const run = engine.start('signup', 'u1', { plan: 'pro' });
    engine.complete(run.runId); // complete 'plan'
    expect(engine.currentStep(run.runId)!.id).toBe('payment');
    const run2 = engine.start('signup', 'u2', { plan: 'enterprise' });
    engine.complete(run2.runId);
    expect(engine.currentStep(run2.runId)!.id).toBe('sales');
  });

  it('no matching branch ends the flow', () => {
    const run = engine.start('signup', 'u1', { plan: 'free' });
    engine.complete(run.runId);
    expect(run.state).toBe('completed');
  });

  it('validation hook fails the step, success advances', () => {
    engine.registerFlow({
      flowId: 'v', version: 1, start: 'email',
      steps: [
        {
          id: 'email', title: 'Email',
          validate: (d) => (typeof d === 'object' && d !== null && /^[^@]+@[^@]+$/.test((d as Record<string, unknown>).email as string)
            ? null : 'invalid email'),
        },
      ],
    });
    const run = engine.start('v', 'u1');
    expect(() => engine.complete(run.runId, { email: 'nope' })).toThrow(FlowError);
    expect(run.steps.get('email')!.status).toBe('failed');
    expect(() => engine.complete(run.runId, { email: 'nope' })).toThrow(); // still on failed step? status resets via complete→validate again
    engine.complete(run.runId, { email: 'a@b.com' });
    expect(run.state).toBe('completed');
    expect(run.data.email).toBe('a@b.com');
  });

  it('start returns existing in-progress run (resumable)', () => {
    const r1 = engine.start('welcome', 'u1');
    const r2 = engine.start('welcome', 'u1');
    expect(r2.runId).toBe(r1.runId);
  });

  it('snapshot + restore rehydrates a run in a fresh engine', () => {
    const run = engine.start('welcome', 'u1');
    engine.complete(run.runId);
    const snap = engine.snapshotRun(run.runId);

    const fresh = new FlowEngine(clock);
    fresh.registerFlow(linear);
    fresh.restoreRun(snap);
    expect(fresh.currentStep(run.runId)!.id).toBe('b');
    expect(fresh.progress(run.runId)).toBeCloseTo(1 / 3);
  });

  it('abandon → resume reactivates', () => {
    const run = engine.start('welcome', 'u1');
    engine.abandon(run.runId);
    expect(run.state).toBe('abandoned');
    engine.resume(run.runId);
    expect(run.state).toBe('in-progress');
  });

  it('conditional step skipped at activation when data changes', () => {
    engine.registerFlow({
      flowId: 'cond', version: 1, start: 'a',
      steps: [
        { id: 'a', title: 'a', next: 'b' },
        { id: 'b', title: 'b', requiredWhen: Predicates.truthy('needsB'), next: 'c' },
        { id: 'c', title: 'c' },
      ],
    });
    // needsB true at start → 'b' in order; completing 'a' sets needsB=false → b auto-skips
    const run = engine.start('cond', 'u1', { needsB: true });
    engine.complete(run.runId, { needsB: false });
    expect(engine.currentStep(run.runId)!.id).toBe('c');
    expect(run.steps.get('b')!.status).toBe('skipped');
  });
});

// ------------------------------------------------------------- Funnel

describe('FunnelTracker', () => {
  it('tracks entry/completion/drop-off', () => {
    const clock = fakeClock(0);
    const engine = new FlowEngine(clock);
    engine.registerFlow(linear);
    // user1 completes fully; user2 drops after step a
    const r1 = engine.start('welcome', 'u1');
    engine.complete(r1.runId);
    engine.skip(r1.runId);
    engine.complete(r1.runId);
    const r2 = engine.start('welcome', 'u2');
    engine.complete(r2.runId);
    // user2 abandons at b
    const funnel = engine.funnel.funnel('welcome', ['a', 'b', 'c']);
    const a = funnel.find((f) => f.stepId === 'a')!;
    const b = funnel.find((f) => f.stepId === 'b')!;
    expect(a.entered).toBe(2);
    expect(a.completed).toBe(2);
    expect(b.entered).toBe(2);
    expect(b.skipped).toBe(1);
    expect(b.passRate).toBe(0.5);
    expect(engine.funnel.completionRate('welcome', ['a', 'b', 'c'])).toBe(0.5);
  });
});

// ------------------------------------------------------------- Reminders

describe('ReminderScheduler', () => {
  it('schedules cadence reminders for idle runs, dedupes, and cancels on activity', async () => {
    const clock = fakeClock(0);
    const engine = new FlowEngine(clock, DEFAULT_CADENCE);
    engine.registerFlow(linear);
    const run = engine.start('welcome', 'u1');
    engine.complete(run.runId); // active, at step b

    clock.advance(25 * 3600_000); // idle > 24h
    const scheduled = engine.scheduleReminders();
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].runId).toBe(run.runId);
    // no double-schedule on rescan
    expect(engine.scheduleReminders()).toHaveLength(0);

    // dispatch sends them
    const sent: string[] = [];
    const n = await engine.reminders.dispatch(async (r) => { sent.push(r.runId); });
    expect(n).toBe(1);
    expect(sent).toEqual([run.runId]);

    // longer idle hits the 72h cadence
    clock.advance(48 * 3600_000);
    const more = engine.scheduleReminders();
    expect(more).toHaveLength(1);

    // activity cancels pending
    engine.resume(run.runId);
    expect(engine.reminders.due()).toHaveLength(0);
  });

  it('markAbandoned flips idle runs', () => {
    const clock = fakeClock(0);
    const engine = new FlowEngine(clock);
    engine.registerFlow(linear);
    engine.start('welcome', 'u1');
    clock.advance(10 * 24 * 3600_000);
    expect(engine.markAbandoned(7 * 24 * 3600_000)).toBe(1);
    expect(engine.runs.all('abandoned')).toHaveLength(1);
  });
});

// ------------------------------------------------------------- RunStore

describe('RunStore', () => {
  it('snapshot/restore round-trips step state', () => {
    const store = new RunStore();
    const run = {
      runId: 'r1', flowId: 'f', userId: 'u', variantId: null,
      state: 'in-progress' as const, stepOrder: ['a', 'b'], cursor: 1,
      steps: new Map([
        ['a', { stepId: 'a', status: 'completed' as const, startedAt: 0, completedAt: 5 }],
        ['b', { stepId: 'b', status: 'active' as const, startedAt: 5, completedAt: null }],
      ]),
      startedAt: 0, lastActiveAt: 5, completedAt: null, data: { x: 1 },
    };
    store.save(run);
    const snap = store.snapshot('r1');
    const restored = store.restore(snap);
    expect(restored.steps.get('a')!.status).toBe('completed');
    expect(restored.data.x).toBe(1);
  });
});
