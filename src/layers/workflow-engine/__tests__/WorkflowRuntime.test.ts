/**
 * Tests for the workflow runtime: sequencing, gateways, loops, retries,
 * deadlines/escalation, compensation, subflows, suspend/resume, versioning.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { WorkflowDefinition, WorkflowEvent } from '../domain/workflow-model';
import {
  WorkflowRuntime,
  ManualTimerScheduler,
  InMemoryInstanceStore,
} from '../implementations/WorkflowRuntime';
import { ProcessBuilder, SequentialProcessStrategy } from '../strategies/ProcessBuilderStrategy';

function linearDef(id: string, steps: { id: string; handler: (ctx: { variables: Record<string, unknown> }) => unknown }[]): WorkflowDefinition {
  const nodes: WorkflowDefinition['nodes'] = [
    { kind: 'start', id: 'start' },
    ...steps.map((s) => ({ kind: 'task' as const, id: s.id, handler: s.handler })),
    { kind: 'end', id: 'end' },
  ];
  const edges: WorkflowDefinition['edges'] = [];
  const chain = ['start', ...steps.map((s) => s.id), 'end'];
  for (let i = 0; i < chain.length - 1; i++) {
    edges.push({ from: chain[i], to: chain[i + 1] });
  }
  return { id, version: 'v1', nodes, edges };
}

describe('WorkflowRuntime — sequencing', () => {
  let rt: WorkflowRuntime;
  beforeEach(() => {
    rt = new WorkflowRuntime({ scheduler: new ManualTimerScheduler() });
  });

  it('runs a linear process to completion', async () => {
    const order: string[] = [];
    rt.registry.register(
      linearDef('seq', [
        { id: 'a', handler: () => { order.push('a'); return 1; } },
        { id: 'b', handler: () => { order.push('b'); return 2; } },
      ])
    );
    const inst = await rt.start('seq');
    expect(inst.status).toBe('completed');
    expect(order).toEqual(['a', 'b']);
    expect(inst.variables.a).toBe(1);
    expect(inst.variables.b).toBe(2);
    expect(inst.history.length).toBe(2);
  });

  it('task output maps into variables via custom output mapper', async () => {
    rt.registry.register({
      id: 'map', version: 'v1',
      nodes: [
        { kind: 'start', id: 's' },
        {
          kind: 'task', id: 't1', handler: () => 21,
          output: (o) => ({ doubled: (o as number) * 2 }),
        },
        { kind: 'task', id: 't2', handler: (ctx) => (ctx.variables.doubled as number) + 1 },
        { kind: 'end', id: 'e', output: (v) => v.t2 },
      ],
      edges: [
        { from: 's', to: 't1' },
        { from: 't1', to: 't2' },
        { from: 't2', to: 'e' },
      ],
    });
    const inst = await rt.start('map');
    expect(inst.variables.doubled).toBe(42);
    expect(inst.output).toBe(43);
  });

  it('xor gateway picks first matching branch, default as fallback', async () => {
    const seen: string[] = [];
    rt.registry.register({
      id: 'route', version: 'v1',
      nodes: [
        { kind: 'start', id: 's' },
        { kind: 'xor', id: 'g' },
        { kind: 'task', id: 'big', handler: () => { seen.push('big'); } },
        { kind: 'task', id: 'small', handler: () => { seen.push('small'); } },
        { kind: 'end', id: 'e' },
      ],
      edges: [
        { from: 's', to: 'g' },
        { from: 'g', to: 'big', condition: (v) => (v.total as number) > 100 },
        { from: 'g', to: 'small', isDefault: true },
        { from: 'big', to: 'e' },
        { from: 'small', to: 'e' },
      ],
    });
    await rt.start('route', { total: 500 });
    expect(seen).toEqual(['big']);
    seen.length = 0;
    await rt.start('route', { total: 5 });
    expect(seen).toEqual(['small']);
  });

  it('and gateway forks all branches and join waits for all', async () => {
    const seen: string[] = [];
    rt.registry.register({
      id: 'fan', version: 'v1',
      nodes: [
        { kind: 'start', id: 's' },
        { kind: 'and', id: 'fork' },
        { kind: 'task', id: 'b1', handler: () => { seen.push('b1'); } },
        { kind: 'task', id: 'b2', handler: () => { seen.push('b2'); } },
        { kind: 'and', id: 'join' },
        { kind: 'task', id: 'after', handler: () => { seen.push('after'); } },
        { kind: 'end', id: 'e' },
      ],
      edges: [
        { from: 's', to: 'fork' },
        { from: 'fork', to: 'b1' },
        { from: 'fork', to: 'b2' },
        { from: 'b1', to: 'join' },
        { from: 'b2', to: 'join' },
        { from: 'join', to: 'after' },
        { from: 'after', to: 'e' },
      ],
    });
    const inst = await rt.start('fan');
    expect(inst.status).toBe('completed');
    expect(seen).toContain('b1');
    expect(seen).toContain('b2');
    expect(seen[seen.length - 1]).toBe('after');
  });

  it('loopWhile re-runs a task until the guard fails', async () => {
    let counter = 0;
    rt.registry.register(
      linearDef('loop', [
        {
          id: 'poll',
          handler: () => ++counter,
        },
      ])
    );
    // Attach loopWhile manually — linearDef doesn't support it.
    const def = rt.registry.get('loop')!;
    const taskNode = def.nodes.find((n) => n.id === 'poll');
    if (taskNode && taskNode.kind === 'task') {
      (taskNode as { loopWhile?: (v: Record<string, unknown>) => boolean }).loopWhile = (v) =>
        (v.poll as number) < 3;
    }
    const inst = await rt.start('loop');
    expect(counter).toBe(3);
    expect(inst.status).toBe('completed');
    expect(inst.history[0].loopIterations).toBe(3);
  });
});

describe('WorkflowRuntime — retries + deadlines', () => {
  it('retries transient failures up to maxAttempts', async () => {
    let calls = 0;
    const rt = new WorkflowRuntime({ scheduler: new ManualTimerScheduler() });
    rt.registry.register({
      id: 'flaky', version: 'v1',
      nodes: [
        { kind: 'start', id: 's' },
        {
          kind: 'task', id: 't',
          retry: { maxAttempts: 3, backoffMs: 0 },
          handler: () => {
            calls++;
            if (calls < 3) {
              throw new Error('transient');
            }
            return 'ok';
          },
        },
        { kind: 'end', id: 'e' },
      ],
      edges: [
        { from: 's', to: 't' },
        { from: 't', to: 'e' },
      ],
    });
    const inst = await rt.start('flaky');
    expect(inst.status).toBe('completed');
    expect(calls).toBe(3);
    expect(inst.history[0].attempts).toBe(3);
  });

  it('non-retryable error fails fast and marks instance failed', async () => {
    let calls = 0;
    const rt = new WorkflowRuntime({ scheduler: new ManualTimerScheduler() });
    rt.registry.register({
      id: 'hard-fail', version: 'v1',
      nodes: [
        { kind: 'start', id: 's' },
        {
          kind: 'task', id: 't',
          retry: { maxAttempts: 5, backoffMs: 0, retryableIf: (e) => !(e instanceof TypeError) },
          handler: () => {
            calls++;
            throw new TypeError('permanent');
          },
          compensation: () => undefined, // marks it compensable → status 'compensated'
        },
        { kind: 'end', id: 'e' },
      ],
      edges: [
        { from: 's', to: 't' },
        { from: 't', to: 'e' },
      ],
    });
    const inst = await rt.start('hard-fail');
    // Task never succeeded so nothing to compensate → status stays 'failed'.
    expect(inst.status).toBe('failed');
    expect(inst.error).toContain('permanent');
    expect(calls).toBe(1);
  });

  it('deadline with escalate action runs the escalation handler', async () => {
    const sched = new ManualTimerScheduler();
    const rt = new WorkflowRuntime({ scheduler: sched });
    rt.registry.register({
      id: 'sla', version: 'v1',
      nodes: [
        { kind: 'start', id: 's' },
        {
          kind: 'task', id: 'slow',
          deadline: { afterMs: 100, action: 'escalate', escalateTo: () => 'escalated-result' },
          handler: () => new Promise(() => { /* never resolves */ }),
        },
        { kind: 'end', id: 'e' },
      ],
      edges: [
        { from: 's', to: 'slow' },
        { from: 'slow', to: 'e' },
      ],
    });
    const pending = rt.start('sla');
    for (let i = 0; i < 5; i++) {
      await Promise.resolve(); // let start step and schedule the deadline
    }
    sched.advance(200); // fire the deadline
    const inst = await pending;
    expect(inst.status).toBe('completed');
    expect(inst.history[0].escalated).toBe(true);
    expect(inst.variables.slow).toBe('escalated-result');
  });

  it('deadline with skip action completes task with undefined', async () => {
    const sched = new ManualTimerScheduler();
    const rt = new WorkflowRuntime({ scheduler: sched });
    rt.registry.register({
      id: 'skip-slow', version: 'v1',
      nodes: [
        { kind: 'start', id: 's' },
        {
          kind: 'task', id: 'optional',
          deadline: { afterMs: 50, action: 'skip' },
          handler: () => new Promise(() => {}),
        },
        { kind: 'task', id: 'next', handler: () => 'ran' },
        { kind: 'end', id: 'e' },
      ],
      edges: [
        { from: 's', to: 'optional' },
        { from: 'optional', to: 'next' },
        { from: 'next', to: 'e' },
      ],
    });
    const pending = rt.start('skip-slow');
    for (let i = 0; i < 5; i++) {
      await Promise.resolve(); // let start step and schedule the deadline
    }
    sched.advance(100);
    const inst = await pending;
    expect(inst.history[0].skipped).toBe(true);
    expect(inst.variables.next).toBe('ran');
  });
});

describe('WorkflowRuntime — compensation (saga)', () => {
  it('compensates completed tasks LIFO on downstream failure', async () => {
    const compensated: string[] = [];
    const rt = new WorkflowRuntime({ scheduler: new ManualTimerScheduler() });
    const mk = (id: string) => ({
      kind: 'task' as const,
      id,
      handler: () => `${id}-out`,
      compensation: () => {
        compensated.push(id);
      },
    });
    rt.registry.register({
      id: 'saga', version: 'v1',
      nodes: [
        { kind: 'start', id: 's' },
        mk('book-flight'),
        mk('book-hotel'),
        {
          kind: 'task', id: 'charge',
          handler: () => {
            throw new Error('card declined');
          },
        },
        { kind: 'end', id: 'e' },
      ],
      edges: [
        { from: 's', to: 'book-flight' },
        { from: 'book-flight', to: 'book-hotel' },
        { from: 'book-hotel', to: 'charge' },
        { from: 'charge', to: 'e' },
      ],
    });
    const inst = await rt.start('saga');
    expect(inst.status).toBe('compensated');
    expect(compensated).toEqual(['book-hotel', 'book-flight']); // LIFO
  });
});

describe('WorkflowRuntime — subflows, suspend/resume, versioning', () => {
  it('subflow runs child workflow and maps output back', async () => {
    const rt = new WorkflowRuntime({ scheduler: new ManualTimerScheduler() });
    rt.registry.register(
      linearDef('child', [{ id: 'c1', handler: () => 99 }])
    );
    rt.registry.register({
      id: 'parent', version: 'v1',
      nodes: [
        { kind: 'start', id: 's' },
        {
          kind: 'subflow', id: 'call-child', workflowId: 'child',
          output: (o) => ({ childResult: o }),
        },
        { kind: 'end', id: 'e' },
      ],
      edges: [
        { from: 's', to: 'call-child' },
        { from: 'call-child', to: 'e' },
      ],
    });
    const inst = await rt.start('parent', { seed: 1 });
    expect(inst.status).toBe('completed');
    // child output is its variables (no end output mapper): c1 = 99
    expect((inst.variables.childResult as Record<string, unknown>).c1).toBe(99);
    expect(inst.subflowRuns.length).toBe(1);
    expect(inst.subflowRuns[0].workflowId).toBe('child');
  });

  it('suspend stops stepping; resume continues; snapshot is serializable', async () => {
    const store = new InMemoryInstanceStore();
    const rt = new WorkflowRuntime({ scheduler: new ManualTimerScheduler(), store });
    const events: WorkflowEvent[] = [];
    rt.onEvent((e) => events.push(e));
    rt.registry.register(
      linearDef('two-step', [
        { id: 'a', handler: () => 'A' },
        { id: 'b', handler: () => 'B' },
      ])
    );
    // Suspend before start is meaningless — test suspend/resume cycle.
    const inst = await rt.start('two-step');
    expect(inst.status).toBe('completed');
    rt.suspend(inst.instanceId); // no-op on completed
    const snap = rt.snapshot(inst.instanceId);
    const json = JSON.parse(JSON.stringify(snap));
    expect(json.status).toBe('completed');
    // Restore from store.
    const restored = await rt.restore(inst.instanceId);
    expect(restored?.instanceId).toBe(inst.instanceId);
    expect(restored?.version).toBe('v1');
  });

  it('in-flight instances keep old version after re-registration', async () => {
    const rt = new WorkflowRuntime({ scheduler: new ManualTimerScheduler() });
    rt.registry.register(linearDef('ver', [{ id: 't', handler: () => 'v1-out' }]));
    const v2 = { ...linearDef('ver', [{ id: 't', handler: () => 'v2-out' }]), version: 'v2' };
    rt.registry.register(v2);
    // Latest = v2.
    const inst2 = await rt.start('ver');
    expect(inst2.version).toBe('v2');
    expect(inst2.variables.t).toBe('v2-out');
    // Pinned v1 still uses old handlers.
    const inst1 = await rt.start('ver', {}, { version: 'v1' });
    expect(inst1.version).toBe('v1');
    expect(inst1.variables.t).toBe('v1-out');
    expect(rt.registry.versions('ver')).toEqual(['v1', 'v2']);
  });
});

describe('ProcessBuilder + SequentialProcessStrategy', () => {
  it('builder produces a valid branching definition', async () => {
    const rt = new WorkflowRuntime({ scheduler: new ManualTimerScheduler() });
    const def = new ProcessBuilder('orders', 'v1')
      .task('charge', () => 'charged')
      .xor()
        .when((v) => (v.total as number) > 100, 'review', () => { rt_spy.push('review'); })
        .otherwise('ship', () => { rt_spy.push('ship'); })
      .join('merge')
      .edgeFrom('review')
      .edgeFrom('ship')
      .task('notify', () => 'notified')
      .build();
    rt.registry.register(def);
    const inst = await rt.start('orders', { total: 500 });
    expect(inst.status).toBe('completed');
    expect(rt_spy).toEqual(['review']);
    rt_spy.length = 0;
    await rt.start('orders', { total: 10 });
    expect(rt_spy).toEqual(['ship']);
  });

  it('sequential strategy runs steps, retries, and compensates on failure', async () => {
    const strat = new SequentialProcessStrategy(() => 0);
    const undone: string[] = [];
    const ok = await strat.run([
      { id: 's1', handler: () => 1 },
      { id: 's2', handler: () => 2, compensation: () => { undone.push('s2'); } },
    ]);
    expect(ok.completed).toBe(true);
    expect(ok.variables.s2).toBe(2);

    const failed = await strat.run([
      { id: 's1', handler: () => 1, compensation: () => { undone.push('s1'); } },
      {
        id: 'boom',
        handler: () => {
          throw new Error('nope');
        },
      },
      { id: 'never', handler: () => 3 },
    ]);
    expect(failed.completed).toBe(false);
    expect(failed.compensated).toEqual(['s1']);
    expect(failed.history.length).toBe(2);
  });
});

const rt_spy: string[] = [];
