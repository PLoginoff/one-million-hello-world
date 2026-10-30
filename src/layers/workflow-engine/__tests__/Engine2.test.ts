/**
 * Workflow Engine engine2 — unit tests (bun:test)
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { WorkflowVersionRegistry, WorkflowVersionError } from '../engine2/WorkflowVersionRegistry';
import { ParallelJoinTracker, JoinError } from '../engine2/ParallelJoinTracker';
import { WorkflowMetricsCollector } from '../engine2/WorkflowMetricsCollector';
import { HumanTaskService, HumanTaskError } from '../engine2/HumanTaskService';
import { WorkflowDefinition } from '../domain/workflow-model';

function manualClock(start = 1_000_000) {
  let t = start;
  return { clock: () => t, advance: (ms: number) => { t += ms; }, now: () => t };
}

function def(version: string): WorkflowDefinition {
  return {
    id: 'order-flow',
    version,
    nodes: [
      { kind: 'start', id: 'start' },
      { kind: 'task', id: 't1', handler: () => ({ ok: true }) },
      { kind: 'end', id: 'end' },
    ],
    edges: [
      { from: 'start', to: 't1' },
      { from: 't1', to: 'end' },
    ],
  };
}

// ------------------------------------------------------------ WorkflowVersionRegistry

describe('WorkflowVersionRegistry', () => {
  const mc = manualClock();
  let reg: WorkflowVersionRegistry;

  beforeEach(() => {
    reg = new WorkflowVersionRegistry(mc.clock);
  });

  it('registers versions and pins new instances to the default', () => {
    reg.register(def('1.0'));
    reg.register(def('2.0'));
    reg.setDefault('order-flow', '2.0');
    const pin = reg.pinInstance('i-1', 'order-flow');
    expect(pin.version).toBe('2.0');
    expect(reg.resolveForInstance('i-1').version).toBe('2.0');
  });

  it('running instances stay on old version after new default', () => {
    reg.register(def('1.0'));
    const pin = reg.pinInstance('i-old', 'order-flow'); // pins 1.0
    expect(pin.version).toBe('1.0');
    reg.register(def('2.0'));
    reg.setDefault('order-flow', '2.0');
    // Old instance still resolves 1.0; new instance gets 2.0.
    expect(reg.resolveForInstance('i-old').version).toBe('1.0');
    expect(reg.pinInstance('i-new', 'order-flow').version).toBe('2.0');
  });

  it('rejects duplicate registration and invalid definitions', () => {
    reg.register(def('1.0'));
    expect(() => reg.register(def('1.0'))).toThrow(WorkflowVersionError);
    expect(() =>
      reg.register({ id: 'bad', version: '1.0', nodes: [], edges: [] })
    ).toThrow(WorkflowVersionError);
  });

  it('deprecate refuses while instances run, force overrides', () => {
    reg.register(def('1.0'));
    reg.register(def('2.0'));
    reg.pinInstance('i-1', 'order-flow', '1.0');
    expect(() => reg.deprecate('order-flow', '1.0')).toThrow(WorkflowVersionError);
    reg.finishInstance('i-1', 'completed');
    reg.deprecate('order-flow', '1.0');
    expect(() => reg.resolveForStart('order-flow', '1.0')).toThrow(WorkflowVersionError);
    // Default auto-promotes to remaining version.
    expect(reg.defaultVersion('order-flow')).toBe('2.0');
  });

  it('instancesByVersion shows who is pinned where', () => {
    reg.register(def('1.0'));
    reg.register(def('2.0'));
    reg.setDefault('order-flow', '2.0');
    reg.pinInstance('i-a', 'order-flow', '1.0');
    reg.pinInstance('i-b', 'order-flow'); // 2.0
    reg.pinInstance('i-c', 'order-flow'); // 2.0
    expect(reg.instancesByVersion('order-flow', '2.0')).toHaveLength(2);
    expect(reg.runningOnVersion('order-flow', '1.0')).toHaveLength(1);
  });
});

// ------------------------------------------------------------ ParallelJoinTracker

describe('ParallelJoinTracker', () => {
  const mc = manualClock();
  let tracker: ParallelJoinTracker;
  let released: string[];

  beforeEach(() => {
    released = [];
    tracker = new ParallelJoinTracker({
      clock: mc.clock,
      onRelease: (ctx) => released.push(`${ctx.instanceId}:${ctx.gatewayId}`),
    });
  });

  it('releases only when ALL expected branches arrive', () => {
    tracker.fork('i1', 'fork-1', ['a', 'b', 'c']);
    expect(tracker.arrive('i1', 'fork-1', 'a').released).toBe(false);
    expect(tracker.arrive('i1', 'fork-1', 'b').released).toBe(false);
    expect(tracker.arrive('i1', 'fork-1', 'b').released).toBe(false); // dup arrival
    const last = tracker.arrive('i1', 'fork-1', 'c');
    expect(last.released).toBe(true);
    expect(released).toEqual(['i1:fork-1']);
  });

  it('cancelBranch removes a branch from the expectation set', () => {
    tracker.fork('i1', 'fork-1', ['a', 'b']);
    tracker.arrive('i1', 'fork-1', 'a');
    const r = tracker.cancelBranch('i1', 'fork-1', 'b');
    expect(r.released).toBe(true); // no expected branches remain
  });

  it('tick fires onTimeout once for overdue joins', () => {
    const timeouts: string[] = [];
    const t2 = new ParallelJoinTracker({
      clock: mc.clock,
      onTimeout: (ctx, missing) => timeouts.push(`${ctx.gatewayId}:${missing.join(',')}`),
    });
    t2.fork('i1', 'fork-1', ['a', 'b'], 5000);
    t2.arrive('i1', 'fork-1', 'a');
    mc.advance(6000);
    const expired = t2.tick();
    expect(expired).toHaveLength(1);
    expect(expired[0].missing).toEqual(['b']);
    expect(t2.tick()).toHaveLength(0); // fires once
  });

  it('rejects arrivals for unexpected branches and duplicate forks', () => {
    tracker.fork('i1', 'fork-1', ['a']);
    expect(() => tracker.arrive('i1', 'fork-1', 'zzz')).toThrow(JoinError);
    expect(() => tracker.fork('i1', 'fork-1', ['a'])).toThrow(JoinError);
    expect(() => tracker.arrive('i1', 'nope', 'a')).toThrow(JoinError);
  });

  it('tracks joins per instance independently', () => {
    tracker.fork('i1', 'fork-1', ['a', 'b']);
    tracker.fork('i2', 'fork-1', ['a', 'b']);
    tracker.arrive('i1', 'fork-1', 'a');
    tracker.arrive('i1', 'fork-1', 'b');
    expect(tracker.state('i1', 'fork-1')!.released).toBe(true);
    expect(tracker.state('i2', 'fork-1')!.released).toBe(false);
    expect(tracker.pending()).toHaveLength(1);
  });
});

// ------------------------------------------------------------ WorkflowMetricsCollector

describe('WorkflowMetricsCollector', () => {
  const mc = manualClock();
  let metrics: WorkflowMetricsCollector;

  beforeEach(() => {
    metrics = new WorkflowMetricsCollector({ clock: mc.clock });
  });

  it('computes per-step percentiles', () => {
    // 10 samples: 10..100
    for (let i = 1; i <= 10; i++) {
      metrics.recordStep('i1', 'credit-check', i * 10, { status: 'completed' });
    }
    const s = metrics.stepStats('credit-check')!;
    expect(s.samples).toBe(10);
    expect(s.meanMs).toBe(55);
    expect(s.p50Ms).toBe(50);
    expect(s.minMs).toBe(10);
    expect(s.maxMs).toBe(100);
    expect(s.statusBreakdown.completed).toBe(1);
  });

  it('ranks bottlenecks by p99', () => {
    for (let i = 0; i < 10; i++) {
      metrics.recordStep('i1', 'fast-step', 10 + i);
      metrics.recordStep('i1', 'slow-step', 1000 + i);
    }
    const top = metrics.bottlenecks(2);
    expect(top[0].nodeId).toBe('slow-step');
    expect(top[1].nodeId).toBe('fast-step');
  });

  it('compares versions across instances', () => {
    metrics.recordInstance('i1', 'order-flow', '1.0', 500);
    metrics.recordInstance('i2', 'order-flow', '1.0', 700);
    metrics.recordInstance('i3', 'order-flow', '2.0', 200);
    const cmp = metrics.versionCompare('order-flow');
    expect(cmp).toHaveLength(2);
    expect(cmp.find((v) => v.version === '1.0')!.meanMs).toBe(600);
    expect(cmp.find((v) => v.version === '2.0')!.meanMs).toBe(200);
  });

  it('bounds the sample reservoir', () => {
    const m = new WorkflowMetricsCollector({ reservoir: 100 });
    for (let i = 0; i < 200; i++) m.recordStep('i', 'n', i);
    expect(m.samples('n')).toHaveLength(100);
  });
});

// ------------------------------------------------------------ HumanTaskService

describe('HumanTaskService', () => {
  const mc = manualClock();
  let svc: HumanTaskService;

  beforeEach(() => {
    svc = new HumanTaskService({ clock: mc.clock, defaultEscalationTarget: 'mgr-1' });
  });

  it('claim → complete lifecycle with audit trail', () => {
    const t = svc.createTask({ instanceId: 'i1', nodeId: 'approve', title: 'Approve order', candidateGroups: ['approvers'] });
    expect(t.status).toBe('open');
    svc.claim(t.taskId, 'alice');
    svc.complete(t.taskId, 'alice', { approved: true });
    expect(svc.get(t.taskId)!.status).toBe('completed');
    const events = svc.audit(t.taskId).map((e) => e.event);
    expect(events).toEqual(['created', 'claimed', 'completed']);
  });

  it('delegation hands the task to another user', () => {
    const t = svc.createTask({ instanceId: 'i1', nodeId: 'review', title: 'Review', assignee: 'alice' });
    svc.delegate(t.taskId, 'alice', 'bob', 'out of office');
    expect(svc.get(t.taskId)!.assignee).toBe('bob');
    expect(svc.inbox('alice')).toHaveLength(0);
    expect(svc.inbox('bob')).toHaveLength(1);
    expect(() => svc.delegate(t.taskId, 'alice', 'carol')).toThrow(HumanTaskError);
  });

  it('escalation bumps priority and retargets', () => {
    const t = svc.createTask({ instanceId: 'i1', nodeId: 'review', title: 'Review', assignee: 'alice' });
    svc.escalate(t.taskId, 'mgr-1', 'no response in 24h');
    const after = svc.get(t.taskId)!;
    expect(after.status).toBe('escalated');
    expect(after.escalationCount).toBe(1);
    expect(after.priority).toBe('urgent');
    expect(after.assignee).toBe('mgr-1');
  });

  it('tick auto-escalates tasks past dueAt', () => {
    svc.createTask({ instanceId: 'i1', nodeId: 'n', title: 'Late task', candidateGroups: ['g'], dueInMs: 1000 });
    svc.createTask({ instanceId: 'i1', nodeId: 'n2', title: 'Fine task', candidateGroups: ['g'], dueInMs: 60_000 });
    mc.advance(5000);
    const escalated = svc.tick();
    expect(escalated).toHaveLength(1);
    expect(svc.get(escalated[0])!.escalatedTo).toBe('mgr-1');
  });

  it('groupQueue lists unclaimed tasks; claim removes them', () => {
    const t = svc.createTask({ instanceId: 'i1', nodeId: 'n', title: 'Queued', candidateGroups: ['approvers'] });
    expect(svc.groupQueue('approvers')).toHaveLength(1);
    svc.claim(t.taskId, 'alice');
    expect(svc.groupQueue('approvers')).toHaveLength(0);
  });

  it('only the assignee can complete', () => {
    const t = svc.createTask({ instanceId: 'i1', nodeId: 'n', title: 'T', assignee: 'alice' });
    expect(() => svc.complete(t.taskId, 'bob')).toThrow(HumanTaskError);
    svc.complete(t.taskId, 'alice');
  });

  it('meanCycleTimeMs averages completed tasks', () => {
    const t1 = svc.createTask({ instanceId: 'i1', nodeId: 'n', title: 'A', assignee: 'a' });
    mc.advance(100);
    svc.complete(t1.taskId, 'a');
    const t2 = svc.createTask({ instanceId: 'i1', nodeId: 'n', title: 'B', assignee: 'a' });
    mc.advance(300);
    svc.complete(t2.taskId, 'a');
    expect(svc.meanCycleTimeMs()).toBe(200); // (100+300)/2
  });
});
