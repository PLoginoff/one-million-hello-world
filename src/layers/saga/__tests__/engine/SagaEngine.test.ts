/**
 * Saga Engine tests
 *
 * Covers: lifecycle state machine legality, step+compensation ordering,
 * per-step timeouts with the manual clock, retry-before-compensation,
 * saga log recording/replay, and concurrent instance isolation.
 */

import { describe, it, expect, beforeEach } from 'bun:test';

import {
  SagaEngine,
  ManualScheduler,
  IllegalTransitionError,
  StepTimeoutError,
  UnknownSagaError,
  LEGAL_TRANSITIONS,
} from '../../engine';
import type { SagaStepDef, SagaLifecycle } from '../../engine';

let sched: ManualScheduler;
let eng: SagaEngine;

beforeEach(() => {
  sched = new ManualScheduler();
  eng = new SagaEngine({ clock: sched, scheduler: sched });
});

/** Drains pending microtasks then advances virtual time to fire timers. */
async function pump(ms = 0): Promise<void> {
  // Let promise callbacks (actions) settle first.
  await Promise.resolve();
  await Promise.resolve();
  if (ms > 0) sched.advance(ms);
  await Promise.resolve();
  await Promise.resolve();
}

// --------------------------------------------------------------------------

describe('lifecycle state machine', () => {
  it('LEGAL_TRANSITIONS declares a DAG ending in terminal states', () => {
    expect(LEGAL_TRANSITIONS.completed).toEqual([]);
    expect(LEGAL_TRANSITIONS.failed).toEqual([]);
    expect(LEGAL_TRANSITIONS.compensated).toEqual([]);
    expect(LEGAL_TRANSITIONS.running).toContain('compensating');
  });

  it('walks started → running → completed on the happy path', async () => {
    const id = eng.start({ name: 's', steps: [] }, {});
    expect(eng.status(id)).toBe('started');
    const done = eng.run(id);
    await pump();
    expect(await done).toBe('completed');
  });

  it('rejects unknown instances', () => {
    expect(() => eng.status('nope')).toThrow(UnknownSagaError);
  });
});

// --------------------------------------------------------------------------

describe('step execution + compensation', () => {
  it('runs actions in order, recording outputs for later steps', async () => {
    const order: string[] = [];
    const steps: SagaStepDef<Record<string, unknown>>[] = [
      {
        name: 'reserve',
        action: (ctx) => {
          order.push('reserve');
          ctx.outputs; // visible
          return { seat: 'A1' };
        },
      },
      {
        name: 'charge',
        action: (ctx) => {
          order.push('charge');
          // Sees previous step's output.
          expect((ctx.outputs.reserve as { seat: string }).seat).toBe('A1');
          return { charged: 100 };
        },
      },
    ];
    const id = eng.start({ name: 'booking', steps }, {});
    const done = eng.run(id);
    await pump();
    expect(await done).toBe('completed');
    expect(order).toEqual(['reserve', 'charge']);
    expect(eng.outputs(id)).toEqual({ reserve: { seat: 'A1' }, charge: { charged: 100 } });
  });

  it('compensates completed steps in reverse order on failure', async () => {
    const compensated: string[] = [];
    const steps: SagaStepDef<Record<string, unknown>>[] = [
      {
        name: 'a',
        action: () => 'A',
        compensate: () => void compensated.push('a'),
      },
      {
        name: 'b',
        action: () => 'B',
        compensate: () => void compensated.push('b'),
      },
      {
        name: 'c',
        action: () => {
          throw new Error('boom');
        },
      },
    ];
    const id = eng.start({ name: 's', steps }, {});
    const done = eng.run(id);
    await pump();
    expect(await done).toBe('compensated');
    expect(compensated).toEqual(['b', 'a']); // reverse completion order
  });

  it('compensation receives the step output it undoes', async () => {
    let undone: unknown = null;
    const steps: SagaStepDef[] = [
      { name: 'book', action: () => ({ room: 5 }), compensate: (_c, out) => void (undone = out) },
      {
        name: 'pay',
        action: () => {
          throw new Error('card declined');
        },
      },
    ];
    const id = eng.start({ name: 's', steps }, {});
    const done = eng.run(id);
    await pump();
    expect(await done).toBe('compensated');
    expect(undone).toEqual({ room: 5 });
  });

  it('failed compensation lands in failed state', async () => {
    const steps: SagaStepDef[] = [
      {
        name: 'a',
        action: () => 'A',
        compensate: () => {
          throw new Error('cannot undo');
        },
      },
      {
        name: 'b',
        action: () => {
          throw new Error('trigger');
        },
      },
    ];
    const id = eng.start({ name: 's', steps }, {});
    const done = eng.run(id);
    await pump();
    expect(await done).toBe('failed');
  });
});

// --------------------------------------------------------------------------

describe('retries + timeouts', () => {
  it('retries a flaky step before compensating', async () => {
    let calls = 0;
    const steps: SagaStepDef[] = [
      {
        name: 'flaky',
        retries: 2,
        retryBackoffBaseMs: 100,
        action: () => {
          calls++;
          if (calls < 3) throw new Error('transient');
          return 'ok';
        },
      },
    ];
    const id = eng.start({ name: 's', steps }, {});
    const done = eng.run(id);
    // Attempt 1 fails, backoff 100ms, attempt 2 fails, backoff 200ms,
    // attempt 3 succeeds.
    await pump(50);
    await pump(60); // t=110 → first backoff elapsed
    await pump(200); // second backoff elapsed
    expect(await done).toBe('completed');
    expect(calls).toBe(3);
  });

  it('compensates after retries are exhausted', async () => {
    const compensated: string[] = [];
    const steps: SagaStepDef[] = [
      { name: 'a', action: () => 'A', compensate: () => void compensated.push('a') },
      { name: 'b', retries: 1, action: () => Promise.reject(new Error('always')) },
    ];
    const id = eng.start({ name: 's', steps }, {});
    const done = eng.run(id);
    await pump();
    expect(await done).toBe('compensated');
    expect(compensated).toEqual(['a']);
  });

  it('enforces per-step timeout via the injected scheduler', async () => {
    const steps: SagaStepDef[] = [
      {
        name: 'slow',
        timeoutMs: 500,
        action: () =>
          new Promise((resolve) => {
            // Never resolves within the timeout — resolves at t=10_000.
            sched.setTimeout(() => resolve('late'), 10_000);
          }),
      },
    ];
    const id = eng.start({ name: 's', steps }, {});
    const done = eng.run(id);
    await pump(600); // advance past the timeout
    // Zero completed steps → compensation is a no-op → 'compensated'.
    expect(await done).toBe('compensated');
    // Log recorded the timeout.
    const entries = eng.log.forSaga(id).filter((e) => e.kind === 'step_timed_out');
    expect(entries.length).toBeGreaterThanOrEqual(1);
  });
});

// --------------------------------------------------------------------------

describe('saga log', () => {
  it('records every transition and step event in order', async () => {
    const steps: SagaStepDef[] = [
      { name: 'a', action: () => 'A', compensate: () => {} },
      {
        name: 'b',
        action: () => {
          throw new Error('x');
        },
      },
    ];
    const id = eng.start({ name: 's', steps }, {});
    const done = eng.run(id);
    await pump();
    await done;
    const kinds = eng.log.forSaga(id).map((e) => e.kind);
    expect(kinds[0]).toBe('state'); // started
    expect(kinds).toContain('step_started');
    expect(kinds).toContain('step_succeeded');
    expect(kinds).toContain('step_failed');
    expect(kinds).toContain('compensated_step');
    expect(eng.log.latestState(id)).toBe('compensated');
  });

  it('replay reconstructs observable state', async () => {
    const steps: SagaStepDef[] = [
      { name: 'a', action: () => 'A', compensate: () => {} },
      { name: 'b', action: () => 'B' },
    ];
    const id = eng.start({ name: 's', steps }, {});
    const done = eng.run(id);
    await pump();
    await done;
    const r = eng.log.replay(id);
    expect(r.state).toBe('completed');
    expect(r.completedSteps).toEqual(['a', 'b']);
  });
});

// --------------------------------------------------------------------------

describe('concurrent instances', () => {
  it('runs instances in isolation — one fails without affecting the other', async () => {
    const good: SagaStepDef[] = [{ name: 'g', action: () => 'ok' }];
    const bad: SagaStepDef[] = [
      {
        name: 'x',
        action: () => {
          throw new Error('fail');
        },
      },
    ];
    const id1 = eng.start({ name: 'good', steps: good }, {});
    const id2 = eng.start({ name: 'bad', steps: bad }, {});
    const d1 = eng.run(id1);
    const d2 = eng.run(id2);
    await pump();
    expect(await d1).toBe('completed');
    // 'bad' has no completed steps → nothing to compensate → 'failed' would
    // be wrong; compensation with zero completed steps still transitions
    // through compensating → compensated. Let's verify actual behavior.
    expect(await d2).toBe('compensated');
    // Outputs are per-instance.
    expect(eng.outputs(id1)).toEqual({ g: 'ok' });
    expect(eng.outputs(id2)).toEqual({});
  });
});
