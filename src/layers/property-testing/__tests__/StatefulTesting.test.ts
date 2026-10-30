/**
 * Stateful (model-based) property tests.
 */

import { describe, it, expect } from 'bun:test';
import {
  cmd,
  generateSequence,
  replaySequence,
  shrinkTrace,
  checkStateful,
  int,
  constant,
} from '../engine/index';
import type { Model, Command } from '../engine/index';

/* ------------------------------------------------------------------------ */
/* Stack model: classic stateful example                                    */
/* ------------------------------------------------------------------------ */

type StackModel = number[];
type StackSut = { push(x: number): number; pop(): number | undefined; size(): number; clear(): void };

function makeStackModel(buggy = false): Model<StackModel, StackSut> {
  const createSystem = (): StackSut => {
    const items: number[] = [];
    return {
      push(x) {
        items.push(x);
        return items.length;
      },
      pop() {
        return items.pop();
      },
      size() {
        // injected bug: off-by-one after >3 elements
        return buggy && items.length > 3 ? items.length - 1 : items.length;
      },
      clear() {
        items.length = 0;
      },
    };
  };
  return {
    initialModel: [],
    createSystem,
    commands: [
      cmd<StackModel, StackSut, number, number>('push', int({ min: 0, max: 99 }), {
        model: (m, x) => ({ model: [...m, x], expected: m.length + 1 }),
        run: (s, x) => s.push(x),
      }),
      cmd<StackModel, StackSut, number | undefined, null>('pop', constant(null), {
        pre: (m) => m.length > 0,
        model: (m) => ({ model: m.slice(0, -1), expected: m[m.length - 1] }),
        run: (s) => s.pop(),
      }),
      cmd<StackModel, StackSut, number, null>('size', constant(null), {
        model: (m) => ({ model: m, expected: m.length }),
        run: (s) => s.size(),
      }),
    ] as unknown as Command<StackModel, StackSut, unknown, unknown>[],
  };
}

describe('generateSequence', () => {
  it('generates legal sequences of bounded length', () => {
    const model = makeStackModel();
    const { trace, finalModel } = generateSequence(model, {
      seed: 1,
      minLength: 5,
      maxLength: 10,
    });
    expect(trace.steps.length).toBeGreaterThanOrEqual(1);
    expect(trace.steps.length).toBeLessThanOrEqual(10);
    // all commands known & preconditions held during generation
    for (const s of trace.steps) {
      expect(['push', 'pop', 'size']).toContain(s.commandName);
    }
    // finalModel reflects pushes minus pops
    const pushes = trace.steps.filter((s) => s.commandName === 'push').length;
    const pops = trace.steps.filter((s) => s.commandName === 'pop').length;
    expect(finalModel.length).toBe(pushes - pops);
  });

  it('is deterministic per seed', () => {
    const model = makeStackModel();
    const a = generateSequence(model, { seed: 9, maxLength: 20 }).trace;
    const b = generateSequence(model, { seed: 9, maxLength: 20 }).trace;
    expect(a.steps).toEqual(b.steps);
  });
});

describe('replaySequence', () => {
  it('passes a correct system', async () => {
    const model = makeStackModel(false);
    const { trace } = generateSequence(model, { seed: 3, maxLength: 20 });
    const report = await replaySequence(model, trace);
    expect(report.passed).toBe(true);
    expect(report.failureIndex).toBe(-1);
  });

  it('detects model/system divergence', async () => {
    const model = makeStackModel(true); // buggy size(): len-1 when len>3
    // 4 pushes → model size 4, buggy SUT reports 3
    const trace = {
      steps: [
        { commandName: 'push', arg: 1 },
        { commandName: 'push', arg: 2 },
        { commandName: 'push', arg: 3 },
        { commandName: 'push', arg: 4 },
        { commandName: 'size', arg: null },
      ],
    };
    const report = await replaySequence(model, trace);
    expect(report.passed).toBe(false);
    const fail = report.steps[report.failureIndex];
    expect(fail?.commandName).toBe('size');
    expect(fail?.expected).toBe(4);
    expect(fail?.actual).toBe(3);
    expect(fail?.error).toContain('postcondition');
  });

  it('reports unknown commands and precondition violations', async () => {
    const model = makeStackModel();
    const bad = await replaySequence(model, {
      steps: [{ commandName: 'explode', arg: null }],
    });
    expect(bad.passed).toBe(false);
    expect(bad.steps[0]?.error).toContain('unknown command');

    const bad2 = await replaySequence(model, {
      steps: [{ commandName: 'pop', arg: null }],
    });
    expect(bad2.passed).toBe(false);
    expect(bad2.steps[0]?.error).toContain('precondition');
  });
});

describe('shrinkTrace', () => {
  it('shrinks a failing trace to a minimal failing suffix', async () => {
    // buggy model: size() wrong after >3 pushes
    const model = makeStackModel(true);
    const failingTrace = {
      steps: [
        { commandName: 'push', arg: 1 },
        { commandName: 'push', arg: 2 },
        { commandName: 'push', arg: 3 },
        { commandName: 'push', arg: 4 },
        { commandName: 'push', arg: 5 },
        { commandName: 'size', arg: null },
      ],
    };
    const { trace } = await shrinkTrace(model, failingTrace);
    // minimal: some pushes then a failing size check — at least 4 pushes
    // are needed to trigger the >3 bug
    const pushes = trace.steps.filter((s) => s.commandName === 'push').length;
    expect(pushes).toBeGreaterThanOrEqual(4);
    expect(trace.steps[trace.steps.length - 1]?.commandName).toBe('size');
    // replaying the shrunk trace still fails
    const replay = await replaySequence(model, trace);
    expect(replay.passed).toBe(false);
  });
});

describe('checkStateful', () => {
  it('passes correct systems', async () => {
    const model = makeStackModel(false);
    const report = await checkStateful(model, { seed: 1, sequences: 20, maxLength: 15 });
    expect(report.passed).toBe(true);
  });

  it('finds and shrinks counterexamples', async () => {
    const model = makeStackModel(true);
    const report = await checkStateful(model, {
      seed: 2,
      sequences: 30,
      minLength: 6,
      maxLength: 15,
    });
    expect(report.passed).toBe(false);
    expect(report.counterexample).toBeDefined();
    const pushes = report.counterexample!.steps.filter(
      (s) => s.commandName === 'push'
    ).length;
    expect(pushes).toBeGreaterThanOrEqual(4);
    // counterexample is shorter-or-equal than the original
    expect(report.counterexample!.steps.length).toBeLessThanOrEqual(
      report.original!.steps.length
    );
  });
});

describe('counter model with payload commands', () => {
  it('model tracks increment/decrement invariant', async () => {
    type M = number;
    type S = { inc(n: number): number; dec(n: number): number; get(): number };
    const model: Model<M, S> = {
      initialModel: 0,
      createSystem: () => {
        let v = 0;
        return {
          inc: (n) => (v += n),
          dec: (n) => (v -= n),
          get: () => v,
        };
      },
      commands: [
        cmd<M, S, number, number>('inc', int({ min: 1, max: 10 }), {
          model: (m, n) => ({ model: m + n, expected: m + n }),
          run: (s, n) => s.inc(n),
        }),
        cmd<M, S, number, number>('dec', int({ min: 1, max: 10 }), {
          model: (m, n) => ({ model: m - n, expected: m - n }),
          run: (s, n) => s.dec(n),
        }),
        cmd<M, S, number, null>('get', constant(null), {
          model: (m) => ({ model: m, expected: m }),
          run: (s) => s.get(),
        }),
      ] as unknown as Command<M, S, unknown, unknown>[],
    };
    const report = await checkStateful(model, { seed: 4, sequences: 20, maxLength: 20 });
    expect(report.passed).toBe(true);
  });
});
