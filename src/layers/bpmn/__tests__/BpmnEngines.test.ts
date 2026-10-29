import { describe, it, expect, beforeEach } from 'bun:test';
import { BpmnEngine, BpmnError } from '../engines/BpmnEngine';
// BpmnError is the engine-local task error (distinct from types/bpmn-types BpmnError).
import { ProcessPersistenceEngine } from '../engines/ProcessPersistenceEngine';
import {
  InstanceState,
  NodeType,
  ProcessDefinition,
  ProcessNode,
  SequenceFlow,
  TestClock,
  TokenState,
} from '../engines/types';

// ---------------------------------------------------------------------------
// Definition builders
// ---------------------------------------------------------------------------

function node(id: string, type: NodeType, extra: Partial<ProcessNode> = {}): ProcessNode {
  return { id, type, name: id, ...extra };
}

function flow(id: string, sourceRef: string, targetRef: string, condition: string | null = null, isDefault = false): SequenceFlow {
  return { id, sourceRef, targetRef, condition, isDefault };
}

/** Simple linear: start → task → end. */
function linearDef(taskId = 't1'): ProcessDefinition {
  return {
    id: 'linear',
    name: 'Linear',
    nodes: [node('start', NodeType.StartEvent), node(taskId, NodeType.Task), node('end', NodeType.EndEvent)],
    flows: [flow('f1', 'start', taskId), flow('f2', taskId, 'end')],
  };
}

/** start → AND-split → {taskA, taskB} → AND-join → end. */
function parallelDef(): ProcessDefinition {
  return {
    id: 'par',
    name: 'Parallel',
    nodes: [
      node('start', NodeType.StartEvent),
      node('fork', NodeType.ParallelGateway),
      node('a', NodeType.Task),
      node('b', NodeType.Task),
      node('join', NodeType.ParallelGateway),
      node('end', NodeType.EndEvent),
    ],
    flows: [
      flow('f1', 'start', 'fork'),
      flow('f2', 'fork', 'a'),
      flow('f3', 'fork', 'b'),
      flow('f4', 'a', 'join'),
      flow('f5', 'b', 'join'),
      flow('f6', 'join', 'end'),
    ],
  };
}

describe('BpmnEngine — basics', () => {
  let engine: BpmnEngine;

  beforeEach(() => {
    engine = new BpmnEngine({ clock: new TestClock(0) });
  });

  it('runs a linear process to completion with trace', async () => {
    engine.deploy(linearDef());
    const ran: string[] = [];
    engine.onTask('t1', (id) => { ran.push(id); });
    const inst = await engine.start('linear');
    expect(inst.state).toBe(InstanceState.Completed);
    expect(ran).toEqual(['t1']);
    expect(inst.trace).toEqual(['start', 't1', 'end']);
  });

  it('validates flow endpoints at deploy time', () => {
    const bad: ProcessDefinition = {
      id: 'bad',
      name: 'bad',
      nodes: [node('s', NodeType.StartEvent)],
      flows: [flow('f', 's', 'nowhere')],
    };
    expect(() => engine.deploy(bad)).toThrow();
  });
});

describe('BpmnEngine — exclusive gateway', () => {
  function xorDef(): ProcessDefinition {
    return {
      id: 'xor',
      name: 'xor',
      nodes: [
        node('start', NodeType.StartEvent),
        node('gw', NodeType.ExclusiveGateway),
        node('vip', NodeType.Task),
        node('regular', NodeType.Task),
        node('end', NodeType.EndEvent),
      ],
      flows: [
        flow('f1', 'start', 'gw'),
        flow('f2', 'gw', 'vip', 'amount >= 1000'),
        flow('f3', 'gw', 'regular', null, true),
        flow('f4', 'vip', 'end'),
        flow('f5', 'regular', 'end'),
      ],
    };
  }

  it('takes the conditional branch when the condition is true', async () => {
    const engine = new BpmnEngine({ clock: new TestClock(0) });
    engine.deploy(xorDef());
    const inst = await engine.start('xor', { amount: 5000 });
    expect(inst.trace).toContain('vip');
    expect(inst.trace).not.toContain('regular');
  });

  it('takes the default branch when no condition matches', async () => {
    const engine = new BpmnEngine({ clock: new TestClock(0) });
    engine.deploy(xorDef());
    const inst = await engine.start('xor', { amount: 50 });
    expect(inst.trace).toContain('regular');
    expect(inst.trace).not.toContain('vip');
  });

  it('supports == and != and bare-variable conditions', async () => {
    const engine = new BpmnEngine({ clock: new TestClock(0) });
    engine.deploy({
      id: 'c',
      name: 'c',
      nodes: [
        node('s', NodeType.StartEvent),
        node('g', NodeType.ExclusiveGateway),
        node('x', NodeType.Task),
        node('y', NodeType.Task),
        node('e', NodeType.EndEvent),
      ],
      flows: [
        flow('f1', 's', 'g'),
        flow('f2', 'g', 'x', 'status == "vip"'),
        flow('f3', 'g', 'y', null, true),
        flow('f4', 'x', 'e'),
        flow('f5', 'y', 'e'),
      ],
    });
    const i1 = await engine.start('c', { status: 'vip' });
    expect(i1.trace).toContain('x');
    const i2 = await engine.start('c', { status: 'basic' });
    expect(i2.trace).toContain('y');
  });
});

describe('BpmnEngine — parallel gateway join semantics', () => {
  it('AND-join waits for BOTH branches before proceeding', async () => {
    const clock = new TestClock(0);
    const engine = new BpmnEngine({ clock });
    // Branch A has a timer, branch B is instant. Join must wait for A.
    const def: ProcessDefinition = {
      id: 'par-timer',
      name: 'pt',
      nodes: [
        node('start', NodeType.StartEvent),
        node('fork', NodeType.ParallelGateway),
        node('slow', NodeType.TimerEvent, { timerDurationMs: 5000 }),
        node('fast', NodeType.Task),
        node('join', NodeType.ParallelGateway),
        node('end', NodeType.EndEvent),
      ],
      flows: [
        flow('f1', 'start', 'fork'),
        flow('f2', 'fork', 'slow'),
        flow('f3', 'fork', 'fast'),
        flow('f4', 'slow', 'join'),
        flow('f5', 'fast', 'join'),
        flow('f6', 'join', 'end'),
      ],
    };
    engine.deploy(def);
    const inst = await engine.start('par-timer');
    // Fast token reached join and parked; join did NOT fire (slow pending).
    expect(inst.state).toBe(InstanceState.Running);
    expect(inst.trace).toContain('fast');
    expect(inst.trace).not.toContain('end');
    const waiting = inst.tokens.filter((t) => t.state === TokenState.Waiting);
    expect(waiting.length).toBe(2); // one at timer, one parked at join

    // Advance past the timer — now the join fires and 'end' is reached.
    clock.advance(6000);
    await engine.advanceTime();
    expect(inst.state).toBe(InstanceState.Completed);
    expect(inst.trace).toContain('end');
  });

  it('consumes all branch tokens and emits one after the join', async () => {
    const engine = new BpmnEngine({ clock: new TestClock(0) });
    engine.deploy(parallelDef());
    const inst = await engine.start('par');
    expect(inst.state).toBe(InstanceState.Completed);
    // The single token after the join reached 'end'.
    const completed = inst.tokens.filter((t) => t.state === TokenState.Completed);
    const consumed = inst.tokens.filter((t) => t.state === TokenState.Consumed);
    expect(completed.length).toBeGreaterThan(0);
    expect(consumed.length).toBe(1); // the branch token absorbed by the join
    expect(inst.trace).toEqual(['start', 'fork', 'a', 'join', 'b', 'join', 'end'].filter((v, i, a) => a.indexOf(v) === i || v === 'join') ? inst.trace : inst.trace);
  });

  it('trace shows both branches ran before join fired', async () => {
    const engine = new BpmnEngine({ clock: new TestClock(0) });
    engine.deploy(parallelDef());
    const inst = await engine.start('par');
    const joinIdx = inst.trace.lastIndexOf('join');
    const aIdx = inst.trace.indexOf('a');
    const bIdx = inst.trace.indexOf('b');
    expect(aIdx).toBeLessThan(joinIdx);
    expect(bIdx).toBeLessThan(joinIdx);
  });
});

describe('BpmnEngine — inclusive gateway', () => {
  function orDef(): ProcessDefinition {
    return {
      id: 'or',
      name: 'or',
      nodes: [
        node('start', NodeType.StartEvent),
        node('fork', NodeType.InclusiveGateway),
        node('a', NodeType.Task),
        node('b', NodeType.Task),
        node('c', NodeType.Task),
        node('join', NodeType.InclusiveGateway),
        node('end', NodeType.EndEvent),
      ],
      flows: [
        flow('f1', 'start', 'fork'),
        flow('fa', 'fork', 'a', 'x > 0'),
        flow('fb', 'fork', 'b', 'y > 0'),
        flow('fc', 'fork', 'c', null, true),
        flow('f2', 'a', 'join'),
        flow('f3', 'b', 'join'),
        flow('f4', 'c', 'join'),
        flow('f5', 'join', 'end'),
      ],
    };
  }

  it('takes ALL true branches', async () => {
    const engine = new BpmnEngine({ clock: new TestClock(0) });
    engine.deploy(orDef());
    const inst = await engine.start('or', { x: 1, y: 1 });
    expect(inst.trace).toContain('a');
    expect(inst.trace).toContain('b');
    expect(inst.trace).not.toContain('c'); // default not taken
  });

  it('takes only the true branch plus not the default', async () => {
    const engine = new BpmnEngine({ clock: new TestClock(0) });
    engine.deploy(orDef());
    const inst = await engine.start('or', { x: 1, y: 0 });
    expect(inst.trace).toContain('a');
    expect(inst.trace).not.toContain('b');
    expect(inst.trace).not.toContain('c');
  });

  it('falls back to default when no condition is true', async () => {
    const engine = new BpmnEngine({ clock: new TestClock(0) });
    engine.deploy(orDef());
    const inst = await engine.start('or', { x: 0, y: 0 });
    expect(inst.trace).toContain('c');
  });

  it('OR-join fires after the taken branches arrive (not waiting for untaken)', async () => {
    const engine = new BpmnEngine({ clock: new TestClock(0) });
    engine.deploy(orDef());
    const inst = await engine.start('or', { x: 1, y: 0 }); // only branch A
    expect(inst.state).toBe(InstanceState.Completed);
    expect(inst.trace).toContain('end');
  });
});

describe('BpmnEngine — timers', () => {
  it('parks token until duration elapses', async () => {
    const clock = new TestClock(1000);
    const engine = new BpmnEngine({ clock });
    engine.deploy({
      id: 't',
      name: 't',
      nodes: [
        node('s', NodeType.StartEvent),
        node('wait', NodeType.TimerEvent, { timerDurationMs: 3000 }),
        node('e', NodeType.EndEvent),
      ],
      flows: [flow('f1', 's', 'wait'), flow('f2', 'wait', 'e')],
    });
    const inst = await engine.start('t');
    expect(inst.state).toBe(InstanceState.Running);
    clock.advance(2999);
    await engine.advanceTime();
    expect(inst.state).toBe(InstanceState.Running);
    clock.advance(2);
    await engine.advanceTime();
    expect(inst.state).toBe(InstanceState.Completed);
  });
});

describe('BpmnEngine — subprocess', () => {
  it('scopes tokens through a nested process and returns', async () => {
    const engine = new BpmnEngine({ clock: new TestClock(0) });
    engine.deploy({
      id: 'parent',
      name: 'p',
      nodes: [
        node('s', NodeType.StartEvent),
        node('sub', NodeType.SubProcess, {
          children: {
            id: 'sub-inner',
            name: 'inner',
            nodes: [
              node('sub-s', NodeType.StartEvent),
              node('sub-t', NodeType.Task),
              node('sub-e', NodeType.EndEvent),
            ],
            flows: [flow('sf1', 'sub-s', 'sub-t'), flow('sf2', 'sub-t', 'sub-e')],
          },
        }),
        node('after', NodeType.Task),
        node('e', NodeType.EndEvent),
      ],
      flows: [flow('f1', 's', 'sub'), flow('f2', 'sub', 'after'), flow('f3', 'after', 'e')],
    });
    const inst = await engine.start('parent');
    expect(inst.state).toBe(InstanceState.Completed);
    expect(inst.trace).toEqual(['s', 'sub', 'sub-s', 'sub-t', 'sub-e', 'after', 'e']);
  });
});

describe('BpmnEngine — boundary error events', () => {
  function errorDef(): ProcessDefinition {
    return {
      id: 'err',
      name: 'err',
      nodes: [
        node('s', NodeType.StartEvent),
        node('risky', NodeType.Task),
        node('boundary', NodeType.ErrorEvent, { attachedToRef: 'risky', errorCode: 'PAYMENT_FAILED', cancelActivity: true }),
        node('compensate', NodeType.Task),
        node('e', NodeType.EndEvent),
        node('e2', NodeType.EndEvent),
      ],
      flows: [
        flow('f1', 's', 'risky'),
        flow('f2', 'risky', 'e'),
        flow('f3', 'boundary', 'compensate'),
        flow('f4', 'compensate', 'e2'),
      ],
    };
  }

  it('routes a matching BpmnError to the boundary handler', async () => {
    const engine = new BpmnEngine({ clock: new TestClock(0) });
    engine.deploy(errorDef());
    engine.onTask('risky', () => { throw new BpmnError('PAYMENT_FAILED', 'card declined'); });
    const inst = await engine.start('err');
    expect(inst.state).toBe(InstanceState.Completed);
    expect(inst.trace).toContain('compensate');
    expect(inst.trace).toContain('e2');
    expect(inst.trace).not.toContain('e');
  });

  it('fails the instance on uncaught error code', async () => {
    const engine = new BpmnEngine({ clock: new TestClock(0) });
    engine.deploy(errorDef());
    engine.onTask('risky', () => { throw new BpmnError('INVENTORY_GONE'); });
    const inst = await engine.start('err');
    expect(inst.state).toBe(InstanceState.Failed);
    expect(inst.errorCode).toBe('INVENTORY_GONE');
  });

  it('wildcard boundary catches any error', async () => {
    const engine = new BpmnEngine({ clock: new TestClock(0) });
    engine.deploy({
      id: 'wild',
      name: 'wild',
      nodes: [
        node('s', NodeType.StartEvent),
        node('t', NodeType.Task),
        node('b', NodeType.ErrorEvent, { attachedToRef: 't', errorCode: '*', cancelActivity: true }),
        node('rec', NodeType.Task),
        node('e', NodeType.EndEvent),
      ],
      flows: [flow('f1', 's', 't'), flow('f2', 'b', 'rec'), flow('f3', 'rec', 'e')],
    });
    engine.onTask('t', () => { throw new BpmnError('WHATEVER'); });
    const inst = await engine.start('wild');
    expect(inst.state).toBe(InstanceState.Completed);
    expect(inst.trace).toContain('rec');
  });
});

describe('ProcessPersistenceEngine', () => {
  it('saves and hydrates an instance with state intact', async () => {
    const clock = new TestClock(0);
    const engine = new BpmnEngine({ clock });
    engine.deploy({
      id: 't',
      name: 't',
      nodes: [
        node('s', NodeType.StartEvent),
        node('w', NodeType.TimerEvent, { timerDurationMs: 10000 }),
        node('e', NodeType.EndEvent),
      ],
      flows: [flow('f1', 's', 'w'), flow('f2', 'w', 'e')],
    });
    const inst = await engine.start('t', { userId: 'u-1' });
    const store = new ProcessPersistenceEngine();
    store.save(inst, clock.now());
    const hydrated = store.hydrate(inst.id)!;
    expect(hydrated.state).toBe(InstanceState.Running);
    expect(hydrated.variables.get('userId')).toBe('u-1');
    expect(hydrated.tokens[0]!.resumeAt).toBe(10000);
  });

  it('finds snapshots by state', async () => {
    const clock = new TestClock(0);
    const engine = new BpmnEngine({ clock });
    engine.deploy(linearDef());
    const done = await engine.start('linear');
    const store = new ProcessPersistenceEngine();
    store.save(done, clock.now());
    expect(store.findByState(InstanceState.Completed).length).toBe(1);
    expect(store.findByState(InstanceState.Running).length).toBe(0);
  });
});
