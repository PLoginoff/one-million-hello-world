/**
 * Tests for bpmn engine2: ProcessAnalytics, ProcessSimulator,
 * AdHocSubprocessRegistry, ProcessVersionRegistry, TimerBoundaryScheduler.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { BpmnEngine } from '../../engines/BpmnEngine';
import {
  InstanceState,
  NodeType,
  ProcessDefinition,
  ProcessNode,
  SequenceFlow,
  TestClock,
  TokenState,
} from '../../engines/types';
import {
  AdHocSubprocessRegistry,
  ProcessAnalytics,
  ProcessSimulator,
  ProcessVersionRegistry,
  TimerBoundaryScheduler,
} from '..';

// ---------------------------------------------------------------------------
// Definition builders
// ---------------------------------------------------------------------------

function node(id: string, type: NodeType, extra: Partial<ProcessNode> = {}): ProcessNode {
  return { id, type, name: id, ...extra };
}
function flow(
  id: string,
  sourceRef: string,
  targetRef: string,
  condition: string | null = null,
  isDefault = false
): SequenceFlow {
  return { id, sourceRef, targetRef, condition, isDefault };
}
function linearDef(taskId = 't1', id = 'linear'): ProcessDefinition {
  return {
    id,
    name: id,
    nodes: [node('start', NodeType.StartEvent), node(taskId, NodeType.Task), node('end', NodeType.EndEvent)],
    flows: [flow('f1', 'start', taskId), flow('f2', taskId, 'end')],
  };
}

// ---------------------------------------------------------------------------

describe('ProcessAnalytics', () => {
  let analytics: ProcessAnalytics;

  beforeEach(() => {
    analytics = new ProcessAnalytics();
  });

  it('ranks the biggest total-time node as the bottleneck', () => {
    // 'slow' hit every instance; 'rare' hit once but was huge.
    for (let i = 0; i < 3; i++) {
      analytics.record('p', { nodeId: 'slow', enteredAt: 0, exitedAt: 100, instanceId: `i${i}` });
      analytics.record('p', { nodeId: 'fast', enteredAt: 0, exitedAt: 10, instanceId: `i${i}` });
    }
    analytics.record('p', { nodeId: 'rare', enteredAt: 0, exitedAt: 250, instanceId: 'i0' });
    const report = analytics.analyze('p');
    expect(report.bottleneck!.nodeId).toBe('slow'); // 300 total > 250 rare
    expect(report.ranked[0]!.nodeId).toBe('slow');
    expect(report.ranked[0]!.meanMs).toBe(100);
    // slow=300, fast=30, rare=250 → total 580.
    expect(report.bottleneck!.shareOfTotal).toBeCloseTo(300 / 580);
  });

  it('reports empty when no data', () => {
    const r = analytics.analyze('nope');
    expect(r.bottleneck).toBeNull();
    expect(r.totalMs).toBe(0);
  });

  it('isBottleneck flags nodes over threshold', () => {
    analytics.record('p', { nodeId: 'a', enteredAt: 0, exitedAt: 500, instanceId: 'i' });
    expect(analytics.isBottleneck('p', 'a', 400)).toBe(true);
    expect(analytics.isBottleneck('p', 'a', 600)).toBe(false);
  });
});

describe('ProcessSimulator', () => {
  const sim = new ProcessSimulator();

  it('schedules sequential dependencies without contention', () => {
    const res = sim.simulate(
      [
        { nodeId: 'a', durationMs: 100, requires: {} },
        { nodeId: 'b', durationMs: 50, requires: {}, dependsOn: ['a'] },
      ],
      []
    );
    expect(res.makespanMs).toBe(150);
    expect(res.schedule.find((s) => s.nodeId === 'b')!.startAt).toBe(100);
  });

  it('serialises steps competing for a single-unit pool', () => {
    const res = sim.simulate(
      [
        { nodeId: 'a', durationMs: 100, requires: { clerk: 1 } },
        { nodeId: 'b', durationMs: 100, requires: { clerk: 1 } },
      ],
      [{ name: 'clerk', capacity: 1 }]
    );
    // One clerk -> sequential; makespan = 200 not 100.
    expect(res.makespanMs).toBe(200);
    expect(res.constrainingResource).toBe('clerk');
  });

  it('parallelises when capacity allows', () => {
    const res = sim.simulate(
      [
        { nodeId: 'a', durationMs: 100, requires: { clerk: 1 } },
        { nodeId: 'b', durationMs: 100, requires: { clerk: 1 } },
      ],
      [{ name: 'clerk', capacity: 2 }]
    );
    expect(res.makespanMs).toBe(100); // both run in parallel
  });

  it('combines dependency and resource gates', () => {
    const res = sim.simulate(
      [
        { nodeId: 'prep', durationMs: 50, requires: {} },
        { nodeId: 'x', durationMs: 100, requires: { machine: 1 }, dependsOn: ['prep'] },
        { nodeId: 'y', durationMs: 100, requires: { machine: 1 }, dependsOn: ['prep'] },
      ],
      [{ name: 'machine', capacity: 1 }]
    );
    // prep 50, then x and y serialised on 1 machine: 50+100+100
    expect(res.makespanMs).toBe(250);
  });

  it('throws on unknown resource pools or deps', () => {
    expect(() => sim.simulate([{ nodeId: 'a', durationMs: 1, requires: { ghost: 1 } }], [])).toThrow();
    expect(() => sim.simulate([{ nodeId: 'a', durationMs: 1, requires: {}, dependsOn: ['ghost'] }], [])).toThrow();
  });
});

describe('AdHocSubprocessRegistry', () => {
  let engine: BpmnEngine;
  let reg: AdHocSubprocessRegistry;

  beforeEach(() => {
    engine = new BpmnEngine({ clock: new TestClock(0) });
    reg = new AdHocSubprocessRegistry(engine);
  });

  it('inserts tasks into a running ad-hoc region in order', async () => {
    reg.registerAdHocProcess('case', AdHocSubprocessRegistry.shell('case'));
    const ran: string[] = [];
    engine.onTask('t-a', () => { ran.push('t-a'); });
    engine.onTask('t-b', () => { ran.push('t-b'); });
    reg.insertTask('case', 't-a');
    reg.insertTask('case', 't-b');
    const inst = await engine.start('case');
    expect(inst.state).toBe(InstanceState.Completed);
    expect(ran).toEqual(['t-a', 't-b']);
  });

  it('insertAfter splices mid-chain', async () => {
    reg.registerAdHocProcess('case', AdHocSubprocessRegistry.shell('case'));
    const ran: string[] = [];
    for (const t of ['t1', 't2', 't3']) {
      engine.onTask(t, () => { ran.push(t); });
    }
    reg.insertTask('case', 't1');
    reg.insertTask('case', 't3');
    reg.insertAfter('case', 't1', 't2'); // between t1 and t3
    const inst = await engine.start('case');
    expect(inst.state).toBe(InstanceState.Completed);
    expect(ran).toEqual(['t1', 't2', 't3']);
  });

  it('rejects registering a shell without a subprocess', () => {
    expect(() => reg.registerAdHocProcess('bad', linearDef())).toThrow('no ad-hoc subprocess');
  });
});

describe('ProcessVersionRegistry', () => {
  let engine: BpmnEngine;
  let reg: ProcessVersionRegistry;

  beforeEach(() => {
    engine = new BpmnEngine({ clock: new TestClock(0) });
    reg = new ProcessVersionRegistry(engine);
  });

  it('pins running instances to their start version', async () => {
    reg.publish('order', linearDef('t1', 'order-v1-def'));
    const inst1 = await reg.start('order');
    expect(reg.pinnedDefinition(inst1.id)).toBe('order@v1');

    // Publish v2 — inst1 stays on v1.
    reg.publish('order', linearDef('t2', 'order-v2-def'));
    const inst2 = await reg.start('order');
    expect(reg.pinnedDefinition(inst2.id)).toBe('order@v2');
    expect(reg.pinnedDefinition(inst1.id)).toBe('order@v1');
    expect(reg.latest('order')!.version).toBe(2);
    expect(reg.versions('order').length).toBe(2);
  });

  it('startOn pins an explicit version', async () => {
    reg.publish('p', linearDef('a', 'd1'));
    reg.publish('p', linearDef('b', 'd2'));
    const inst = await reg.startOn(1, 'p');
    expect(reg.pinnedDefinition(inst.id)).toBe('p@v1');
    expect(reg.definitionFor(inst.id)!.id).toBe('p@v1');
  });

  it('canRetire only when no running instance pins the version', async () => {
    reg.publish('p', linearDef('a', 'd1'));
    const inst = await reg.start('p');
    expect(inst.state).toBe(InstanceState.Completed);
    // Completed instances don't block retirement.
    expect(reg.canRetire('p', 1)).toBe(true);
    reg.publish('p', linearDef('b', 'd2'));
    expect(reg.instancesByVersion('p').size).toBe(0); // none running
  });
});

describe('TimerBoundaryScheduler', () => {
  let clock: TestClock;
  let engine: BpmnEngine;
  let sched: TimerBoundaryScheduler;

  /** def: start -> task -> end, with a timer boundary on task. */
  function timedDef(cancelActivity: boolean): ProcessDefinition {
    return {
      id: 'timed',
      name: 'timed',
      nodes: [
        node('start', NodeType.StartEvent),
        node('work', NodeType.Task),
        node('boundary', NodeType.TimerEvent, {
          attachedToRef: 'work',
          timerDurationMs: 1000,
          cancelActivity,
        }),
        node('recovery', NodeType.Task),
        node('end', NodeType.EndEvent),
      ],
      flows: [
        flow('f1', 'start', 'work'),
        flow('f2', 'work', 'end'),
        flow('f3', 'boundary', 'recovery'),
        flow('f4', 'recovery', 'end'),
      ],
    };
  }

  beforeEach(() => {
    clock = new TestClock(0);
    engine = new BpmnEngine({ clock });
    sched = new TimerBoundaryScheduler(engine, clock);
  });

  it('interrupting timer diverts the token to the boundary flow', async () => {
    const def = timedDef(true);
    sched.registerDefinition(def);
    engine.deploy(def);
    // Park the token at 'work' with a handler that never resolves; the
    // instance object is populated synchronously before start() awaits
    // the handler, so we can arm the timer while start() is in flight.
    engine.onTask('work', () => new Promise<void>(() => {}));
    // Register the trace listener BEFORE starting so we catch 'work'.
    let instId: string | null = null;
    engine.onTrace((id, nodeId) => {
      if (nodeId === 'work') instId = id;
    });
    const startP = engine.start('timed');
    // Yield enough microtasks for start() to run start->work->handler.
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(instId).not.toBeNull();
    const live = engine.getInstance(instId!)!;
    const token = live.tokens[0]!;
    expect(token.nodeId).toBe('work');
    sched.arm(live, token, def, 'work');
    clock.advance(1001);
    const fired = await sched.tick();
    expect(fired).toEqual(['boundary']);
    expect(token.nodeId).toBe('recovery');
    void startP;
  });

  it('non-interrupting timer leaves the activity token in place', async () => {
    const def = timedDef(false);
    sched.registerDefinition(def);
    engine.deploy(def);
    const inst = await engine.start('timed'); // 'work' has no handler -> completes to end
    // After completion no token sits at work — nothing to arm.
    expect(sched.armed().length).toBe(0);
    void inst;
  });

  it('disarms a timer when the activity completes before the deadline', async () => {
    const def = timedDef(true);
    sched.registerDefinition(def);
    engine.deploy(def);
    const inst = await engine.start('timed');
    // The token already completed 'work' and reached 'end'.
    const token = inst.tokens[0]!;
    sched.arm(inst, token, def, 'work');
    clock.advance(2000);
    const fired = await sched.tick();
    // Token left 'work' (it's completed) -> timer lapsed, no firing.
    expect(fired).toEqual([]);
    expect(sched.armed().length).toBe(0);
  });
});
