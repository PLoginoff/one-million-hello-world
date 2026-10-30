/**
 * Decoration engine tests — ordering (priority + dependencies),
 * before/around/after chains, predicates, proxy transparency,
 * registry attach/detach, introspection, async hooks, self-healing.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { DecorationEngine } from '../engine/DecorationEngine';
import { DecoratorChain, orderDecorators } from '../engine/DecoratorChain';
import { DecoratorRegistry } from '../engine/DecoratorRegistry';
import { SelfHealingDecorator } from '../engine/SelfHealingDecorator';
import {
  loggingDecorator,
  timingDecorator,
  retryDecorator,
  memoizeDecorator,
  conditionalDecorator,
  TimingRecorder,
} from '../engine/BuiltInDecorators';
import { DecoratorOrderingError } from '../engine/types';
import type { DecoratorClock, IEngineDecorator } from '../engine/types';

class FakeClock implements DecoratorClock {
  t = 1_000_000;
  now(): number {
    return this.t;
  }
  advance(ms: number): void {
    this.t += ms;
  }
}

function makeDecorator(
  name: string,
  priority: number,
  partial: Partial<IEngineDecorator> = {}
): IEngineDecorator {
  return { name, priority, ...partial };
}

/* ================================================================== */
/* orderDecorators                                                     */
/* ================================================================== */

describe('orderDecorators', () => {
  it('orders by ascending priority (outermost first)', () => {
    const a = makeDecorator('a', 30);
    const b = makeDecorator('b', 10);
    const c = makeDecorator('c', 20);
    const out = orderDecorators([a, b, c]).map((d) => d.name);
    expect(out).toEqual(['b', 'c', 'a']);
  });

  it('is stable for equal priorities (insertion order)', () => {
    const a = makeDecorator('a', 10);
    const b = makeDecorator('b', 10);
    const c = makeDecorator('c', 10);
    const out = orderDecorators([a, b, c]).map((d) => d.name);
    expect(out).toEqual(['a', 'b', 'c']);
  });

  it('honors after-constraints over raw priority', () => {
    // z has lowest priority (outermost) but depends on y → y wraps outside.
    const z = makeDecorator('z', 1, { dependsOn: ['y'] });
    const y = makeDecorator('y', 99);
    const x = makeDecorator('x', 50);
    const out = orderDecorators([z, y, x]).map((d) => d.name);
    expect(out.indexOf('y')).toBeLessThan(out.indexOf('z'));
  });

  it('tolerates missing dependencies by default', () => {
    const a = makeDecorator('a', 1, { dependsOn: ['ghost'] });
    expect(() => orderDecorators([a])).not.toThrow();
  });

  it('throws on dependency cycles', () => {
    const a = makeDecorator('a', 1, { dependsOn: ['b'] });
    const b = makeDecorator('b', 2, { dependsOn: ['a'] });
    expect(() => orderDecorators([a, b], true)).toThrow(DecoratorOrderingError);
  });
});

/* ================================================================== */
/* DecoratorChain                                                      */
/* ================================================================== */

describe('DecoratorChain', () => {
  let clock: FakeClock;
  beforeEach(() => {
    clock = new FakeClock();
  });

  it('runs before outermost→innermost, after innermost→outermost', async () => {
    const log: string[] = [];
    const outer = makeDecorator('outer', 1, {
      before: () => void log.push('before:outer'),
      after: () => void log.push('after:outer'),
    });
    const inner = makeDecorator('inner', 2, {
      before: () => void log.push('before:inner'),
      after: () => void log.push('after:inner'),
    });
    const chain = new DecoratorChain('m', orderDecorators([outer, inner]));
    const trace = await chain.invoke(() => 'ok', [], clock.now());
    expect(trace.success).toBe(true);
    expect(trace.value).toBe('ok');
    expect(log).toEqual([
      'before:outer',
      'before:inner',
      'after:inner',
      'after:outer',
    ]);
  });

  it('around hooks nest onion-style around the innermost call', async () => {
    const log: string[] = [];
    const outer = makeDecorator('outer', 1, {
      around: async (_ctx, next) => {
        log.push('outer:enter');
        const v = await next();
        log.push('outer:exit');
        return v;
      },
    });
    const inner = makeDecorator('inner', 2, {
      around: async (_ctx, next) => {
        log.push('inner:enter');
        const v = await next();
        log.push('inner:exit');
        return v;
      },
    });
    const chain = new DecoratorChain('m', orderDecorators([outer, inner]));
    await chain.invoke(() => 'x', [], clock.now());
    expect(log).toEqual(['outer:enter', 'inner:enter', 'inner:exit', 'outer:exit']);
  });

  it('before hooks can rewrite args seen by the innermost call', async () => {
    const double = makeDecorator('double', 1, {
      before: (ctx) => {
        ctx.args = ctx.args.map((a) => (typeof a === 'number' ? a * 2 : a));
      },
    });
    const chain = new DecoratorChain('add', orderDecorators([double]));
    const trace = await chain.invoke(
      (args) => (args as number[]).reduce((a, b) => a + b, 0),
      [1, 2, 3],
      clock.now()
    );
    expect(trace.value).toBe(12);
  });

  it('after hooks can rewrite the result', async () => {
    const upper = makeDecorator('upper', 1, {
      after: (ctx) => {
        if (ctx.error === undefined && typeof ctx.result === 'string') {
          ctx.result = ctx.result.toUpperCase();
        }
      },
    });
    const chain = new DecoratorChain('greet', orderDecorators([upper]));
    const trace = await chain.invoke(() => 'hello', [], clock.now());
    expect(trace.value).toBe('HELLO');
  });

  it('skips decorators whose predicate fails; async predicates await', async () => {
    const gated = makeDecorator('gated', 1, {
      predicate: async (ctx) => {
        await Promise.resolve();
        return ctx.metadata.enable === true;
      },
      before: () => {
        throw new Error('should not run');
      },
    });
    const chain = new DecoratorChain('m', orderDecorators([gated]));
    const skipped = await chain.invoke(() => 1, [], clock.now(), { enable: false });
    expect(skipped.success).toBe(true);
    expect(skipped.skipped).toEqual(['gated']);
    const applied = await chain.invoke(() => 2, [], clock.now(), { enable: true });
    // predicate passed → before hook runs → throws → invocation fails
    expect(applied.success).toBe(false);
    expect(applied.applied).toEqual(['gated']);
  });

  it('around hook can short-circuit (next never called)', async () => {
    let innerCalls = 0;
    const veto = makeDecorator('veto', 1, {
      around: () => Promise.resolve('cached'),
    });
    const chain = new DecoratorChain('m', orderDecorators([veto]));
    const trace = await chain.invoke(() => {
      innerCalls++;
      return 'real';
    }, [], clock.now());
    expect(trace.value).toBe('cached');
    expect(innerCalls).toBe(0);
  });

  it('after hook can swallow errors via errorHandled', async () => {
    const recover = makeDecorator('recover', 1, {
      after: (ctx) => {
        if (ctx.error !== undefined) {
          ctx.errorHandled = true;
          ctx.result = 'fallback';
        }
      },
    });
    const chain = new DecoratorChain('m', orderDecorators([recover]));
    const trace = await chain.invoke(() => {
      throw new Error('boom');
    }, [], clock.now());
    expect(trace.success).toBe(true);
    expect(trace.value).toBe('fallback');
  });

  it('errors propagate when no handler swallows them', async () => {
    const chain = new DecoratorChain('m', []);
    const trace = await chain.invoke(() => {
      throw new Error('nope');
    }, [], clock.now());
    expect(trace.success).toBe(false);
    expect((trace.error as Error).message).toBe('nope');
  });
});

/* ================================================================== */
/* Registry + proxy                                                    */
/* ================================================================== */

class Calculator {
  private calls = 0;
  add(a: number, b: number): number {
    this.calls++;
    return a + b;
  }
  mul(a: number, b: number): number {
    this.calls++;
    return a * b;
  }
  get callCount(): number {
    return this.calls;
  }
  async slowDouble(x: number): Promise<number> {
    this.calls++;
    await Promise.resolve();
    return x * 2;
  }
}

describe('DecoratorRegistry + transparent proxy', () => {
  let clock: FakeClock;
  let registry: DecoratorRegistry;
  beforeEach(() => {
    clock = new FakeClock();
    registry = new DecoratorRegistry({ clock });
  });

  it('proxy preserves the interface type and behavior', async () => {
    registry.register(makeDecorator('noop', 1));
    const calc = new Calculator();
    const proxy = registry.attach(calc, ['noop']);
    expect(proxy.add(2, 3)).toBe(5);
    expect(await proxy.slowDouble(4)).toBe(8);
    expect(proxy instanceof Calculator).toBe(true);
    expect(proxy.callCount).toBe(2);
  });

  it('decorates only listed members when members given', async () => {
    const log: string[] = [];
    registry.register(
      makeDecorator('rec', 1, { before: (ctx) => void log.push(ctx.memberName) })
    );
    const calc = new Calculator();
    const proxy = registry.attach(calc, ['rec'], ['add']);
    proxy.add(1, 1);
    proxy.mul(2, 2);
    expect(log).toEqual(['add']);
  });

  it('tracks decoration metadata for introspection', () => {
    registry.register(makeDecorator('a', 1));
    registry.register(makeDecorator('b', 2));
    const calc = new Calculator();
    registry.attach(calc, ['b', 'a'], ['add'], 'calc-1');
    const meta = registry.describe();
    expect(meta).toHaveLength(1);
    const m = meta[0]!;
    expect(m.targetLabel).toBe('calc-1');
    expect(m.decorators).toEqual(['a', 'b']); // priority order
    expect(m.members['add']).toEqual(['a', 'b']);
  });

  it('detach returns the raw target and drops tracking', () => {
    registry.register(makeDecorator('a', 1));
    const calc = new Calculator();
    const proxy = registry.attach(calc, ['a']);
    expect(registry.registrationCount).toBe(1);
    const raw = registry.detach(proxy);
    expect(raw).toBe(calc);
    expect(registry.registrationCount).toBe(0);
    expect(registry.describe()).toHaveLength(0);
  });

  it('unregister refused while decorator still attached', () => {
    registry.register(makeDecorator('a', 1));
    const calc = new Calculator();
    registry.attach(calc, ['a']);
    expect(registry.unregister('a')).toBe(false);
    expect(registry.has('a')).toBe(true);
  });

  it('usage stats record invocations, skips, hook errors', async () => {
    registry.register(
      makeDecorator('gated', 1, {
        predicate: (ctx) => ctx.args[0] === 'go',
        before: () => undefined,
      })
    );
    const obj = {
      act(arg: string): string {
        return arg;
      },
    };
    const proxy = registry.attach(obj, ['gated'], ['act']);
    proxy.act('go');
    proxy.act('stop');
    // Allow async chain microtasks to settle (proxy wraps in async fn).
    await Promise.resolve();
    await Promise.resolve();
    const stats = registry.usageStats().find((s) => s.name === 'gated');
    expect(stats).toBeDefined();
    expect(stats!.registrations).toBe(1);
    expect(stats!.invocations).toBe(1);
    expect(stats!.skipped).toBe(1);
  });

  it('attach throws for unknown decorator names', () => {
    const calc = new Calculator();
    expect(() => registry.attach(calc, ['ghost'])).toThrow();
  });
});

/* ================================================================== */
/* DecorationEngine                                                    */
/* ================================================================== */

describe('DecorationEngine', () => {
  let engine: DecorationEngine;
  let clock: FakeClock;
  beforeEach(() => {
    clock = new FakeClock();
    engine = new DecorationEngine({ clock });
  });

  it('invoke runs fn through catalog decorators and records trace', async () => {
    const order: string[] = [];
    engine.registerDecorators([
      makeDecorator('outer', 1, { before: () => void order.push('outer') }),
      makeDecorator('inner', 2, { before: () => void order.push('inner') }),
    ]);
    const trace = await engine.invoke(() => 'done', ['outer', 'inner']);
    expect(trace.success).toBe(true);
    expect(trace.value).toBe('done');
    expect(order).toEqual(['outer', 'inner']);
    expect(engine.recentTraces()).toHaveLength(1);
    expect(engine.recentTraces()[0]!.memberName).toBe('apply');
  });

  it('decorateWith auto-registers inline decorators', async () => {
    const logged: string[] = [];
    engine.decorateWith(
      new Calculator(),
      [
        makeDecorator('spy', 1, {
          before: (ctx) => void logged.push(`${ctx.memberName}(${ctx.args.join(',')})`),
        }),
      ],
      ['add']
    );
    const stats = engine.usageStats().map((s) => s.name);
    expect(stats).toContain('spy');
  });

  it('undecorate returns raw target', () => {
    engine.registerDecorator(makeDecorator('x', 1));
    const calc = new Calculator();
    const proxy = engine.decorate(calc, ['x']);
    expect(engine.undecorate(proxy)).toBe(calc);
  });
});

/* ================================================================== */
/* Built-in decorators                                                 */
/* ================================================================== */

describe('built-in decorators', () => {
  let clock: FakeClock;
  beforeEach(() => {
    clock = new FakeClock();
  });

  it('loggingDecorator emits entry and exit', async () => {
    const lines: string[] = [];
    const dec = loggingDecorator({ sink: (_l, m) => void lines.push(m) });
    const chain = new DecoratorChain('work', orderDecorators([dec]));
    await chain.invoke(() => 42, [], clock.now());
    expect(lines[0]).toContain('invoked');
    expect(lines[1]).toContain('completed');
  });

  it('timingDecorator records durations via injectable clock', async () => {
    const recorder = new TimingRecorder(8, clock);
    const dec = timingDecorator({ recorder, clock });
    const chain = new DecoratorChain('work', orderDecorators([dec]));
    await chain.invoke(() => {
      clock.advance(25);
      return 'x';
    }, [], clock.now());
    expect(recorder.count).toBe(1);
    expect(recorder.percentile(50)).toBe(25);
    expect(recorder.max).toBe(25);
  });

  it('retryDecorator re-invokes next on retryable errors', async () => {
    const dec = retryDecorator({ attempts: 3, sleep: () => Promise.resolve() });
    const chain = new DecoratorChain('flaky', orderDecorators([dec]));
    let tries = 0;
    const trace = await chain.invoke(() => {
      tries++;
      if (tries < 3) throw new Error(`fail ${tries}`);
      return 'finally';
    }, [], clock.now());
    expect(trace.success).toBe(true);
    expect(trace.value).toBe('finally');
    expect(tries).toBe(3);
  });

  it('retryDecorator stops on non-retryable errors', async () => {
    const dec = retryDecorator({
      attempts: 5,
      retryable: (e) => e instanceof Error && e.message !== 'fatal',
      sleep: () => Promise.resolve(),
    });
    const chain = new DecoratorChain('flaky', orderDecorators([dec]));
    let tries = 0;
    const trace = await chain.invoke(() => {
      tries++;
      throw new Error('fatal');
    }, [], clock.now());
    expect(trace.success).toBe(false);
    expect(tries).toBe(1);
  });

  it('memoizeDecorator short-circuits repeat calls', async () => {
    const dec = memoizeDecorator({ keyOf: (ctx) => JSON.stringify(ctx.args) });
    const chain = new DecoratorChain('exp', orderDecorators([dec]));
    let runs = 0;
    const fn = (args: readonly unknown[]) => {
      runs++;
      return (args[0] as number) * 10;
    };
    const t1 = await chain.invoke(fn, [5], clock.now());
    const t2 = await chain.invoke(fn, [5], clock.now());
    const t3 = await chain.invoke(fn, [6], clock.now());
    expect(t1.value).toBe(50);
    expect(t2.value).toBe(50);
    expect(t3.value).toBe(60);
    expect(runs).toBe(2);
  });

  it('conditionalDecorator gates application', async () => {
    let ran = false;
    const dec = conditionalDecorator(
      makeDecorator('g', 1, { before: () => void (ran = true) }),
      (ctx) => ctx.args[0] === 'yes'
    );
    const chain = new DecoratorChain('m', orderDecorators([dec]));
    await chain.invoke(() => 'r', ['no'], clock.now());
    expect(ran).toBe(false);
    await chain.invoke(() => 'r', ['yes'], clock.now());
    expect(ran).toBe(true);
  });
});

/* ================================================================== */
/* SelfHealingDecorator                                                */
/* ================================================================== */

type InnerFn = (args: readonly unknown[]) => unknown;

describe('SelfHealingDecorator', () => {
  let clock: FakeClock;
  beforeEach(() => {
    clock = new FakeClock();
  });

  it('swaps inner after threshold consecutive failures', async () => {
    let generation = 0;
    const healer = new SelfHealingDecorator<InnerFn>(
      () => {
        generation++;
        const gen = generation;
        return () => {
          if (gen === 1) throw new Error(`gen${gen} wedged`);
          return `gen${gen} ok`;
        };
      },
      { failureThreshold: 3, clock }
    );

    for (let i = 0; i < 3; i++) {
      await expect(healer.call([])).rejects.toThrow('wedged');
    }
    expect(healer.swapCount).toBe(1);
    const result = await healer.call([]);
    expect(result).toBe('gen2 ok');
  });

  it('resets failure counter on success', async () => {
    let flip = false;
    const healer = new SelfHealingDecorator<InnerFn>(
      () => () => {
        flip = !flip;
        if (flip) throw new Error('alternating');
        return 'ok';
      },
      { failureThreshold: 2, clock }
    );
    await expect(healer.call([])).rejects.toThrow();
    await healer.call([]); // success resets
    await expect(healer.call([])).rejects.toThrow();
    expect(healer.swapCount).toBe(0); // never reached 2 consecutive
  });

  it('honors cooldown between swaps', async () => {
    let generation = 0;
    const healer = new SelfHealingDecorator<InnerFn>(
      () => {
        generation++;
        return () => {
          throw new Error('always fails');
        };
      },
      { failureThreshold: 1, cooldownMs: 1000, clock }
    );
    await expect(healer.call([])).rejects.toThrow();
    expect(healer.swapCount).toBe(1);
    await expect(healer.call([])).rejects.toThrow();
    expect(healer.swapCount).toBe(1); // cooling down
    clock.advance(1001);
    await expect(healer.call([])).rejects.toThrow();
    expect(healer.swapCount).toBe(2);
    expect(generation).toBe(3); // initial + 2 swaps
  });

  it('stops healing at maxSwaps (healing circuit open)', async () => {
    const healer = new SelfHealingDecorator<InnerFn>(
      () => () => {
        throw new Error('broken');
      },
      { failureThreshold: 1, maxSwaps: 2, clock }
    );
    await expect(healer.call([])).rejects.toThrow();
    await expect(healer.call([])).rejects.toThrow();
    await expect(healer.call([])).rejects.toThrow();
    expect(healer.swapCount).toBe(2);
  });

  it('works as an around decorator inside a chain', async () => {
    let generation = 0;
    const healer = new SelfHealingDecorator<InnerFn>(
      () => {
        generation++;
        const gen = generation;
        return () => {
          if (gen === 1) throw new Error('gen1 dead');
          return `gen${gen}`;
        };
      },
      { failureThreshold: 2, clock }
    );
    const chain = new DecoratorChain('m', [healer.asDecorator('healer', 1)]);
    const inner = (args: readonly unknown[]) => healer.inner(args);
    await chain.invoke(inner, [], clock.now()).then((t) => expect(t.success).toBe(false));
    await chain.invoke(inner, [], clock.now()).then((t) => expect(t.success).toBe(false));
    expect(healer.swapCount).toBe(1);
    const ok = await chain.invoke(inner, [], clock.now());
    expect(ok.value).toBe('gen2');
  });
});
