/**
 * DecorationEngine — facade tying the registry, proxy factory, and chain
 * model into one ergonomic surface.
 *
 * Responsibilities:
 * - Owns the `DecoratorRegistry` and exposes attach/detach.
 * - Offers `invoke` for one-off decorated function calls (no proxy) —
 *   the engine-level equivalent of the base `IDecorator.execute` but
 *   with real chains, ordering, and traces.
 * - Keeps a per-member invocation trace ring for diagnostics.
 *
 * @module DecoratorLayer/Engine
 */

import { DecoratorChain, orderDecorators } from './DecoratorChain';
import { DecoratorRegistry } from './DecoratorRegistry';
import {
  DecoratorClock,
  DecorationEngineOptions,
  DecorationMetadata,
  DecoratorUsageStats,
  IEngineDecorator,
  InvocationTrace,
  SystemDecoratorClock,
} from './types';
import { DecoratorError } from '../utils/DecoratorError';

/** A trace plus the decorator names that ran — kept in a bounded ring. */
export interface RecordedInvocation extends InvocationTrace {
  readonly memberName: string;
  readonly at: number;
}

export class DecorationEngine {
  private readonly _registry: DecoratorRegistry;
  private readonly _clock: DecoratorClock;
  private readonly _tolerateMissing: boolean;
  private readonly _traceCapacity: number;
  private readonly _traces: RecordedInvocation[];
  private _traceHead: number;

  constructor(options: DecorationEngineOptions & { traceCapacity?: number } = {}) {
    this._clock = options.clock ?? new SystemDecoratorClock();
    this._tolerateMissing = options.tolerateMissingDependencies ?? true;
    this._registry = new DecoratorRegistry({
      clock: this._clock,
      tolerateMissingDependencies: this._tolerateMissing,
    });
    this._traceCapacity = Math.max(1, options.traceCapacity ?? 512);
    this._traces = [];
    this._traceHead = 0;
  }

  /** Underlying registry for advanced use (unregister, introspection). */
  get registry(): DecoratorRegistry {
    return this._registry;
  }

  /* ---------------------------------------------------------------- */
  /* Catalog                                                           */
  /* ---------------------------------------------------------------- */

  registerDecorator(decorator: IEngineDecorator): void {
    this._registry.register(decorator);
  }

  registerDecorators(decorators: readonly IEngineDecorator[]): void {
    for (const d of decorators) {
      this._registry.register(d);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Attachment                                                        */
  /* ---------------------------------------------------------------- */

  /**
   * Attach named decorators to an object's methods and receive a
   * transparent proxy back.
   */
  decorate<T extends object>(
    target: T,
    decoratorNames: readonly string[],
    members?: readonly string[],
    label?: string
  ): T {
    return this._registry.attach(target, decoratorNames, members, label);
  }

  /**
   * Convenience: attach decorator *instances* directly (no catalog
   * names needed). Internally auto-registers under their names when
   * absent so usage stats still accumulate.
   */
  decorateWith<T extends object>(
    target: T,
    decorators: readonly IEngineDecorator[],
    members?: readonly string[],
    label?: string
  ): T {
    for (const d of decorators) {
      this._registry.registerIfAbsent(d);
    }
    return this._registry.attach(
      target,
      decorators.map((d) => d.name),
      members,
      label
    );
  }

  undecorate<T extends object>(proxy: T): T | undefined {
    return this._registry.detach(proxy);
  }

  /* ---------------------------------------------------------------- */
  /* One-off invocation                                                */
  /* ---------------------------------------------------------------- */

  /**
   * Invoke `fn` through a chain built from catalog names. The function
   * is invoked once per call; `memberName` labels the trace.
   */
  async invoke<T>(
    fn: (args: readonly unknown[]) => Promise<T> | T,
    decoratorNames: readonly string[],
    args: readonly unknown[] = [],
    memberName: string = 'apply'
  ): Promise<InvocationTrace<T>> {
    const start = this._clock.now();
    const decorators = decoratorNames.map((n) => {
      const d = this._registry.get(n);
      if (!d) {
        throw DecoratorError.notFound(`Decorator '${n}' is not registered`);
      }
      return d;
    });
    const ordered = orderDecorators(decorators, this._tolerateMissing);
    const chain = new DecoratorChain(memberName, ordered);

    const trace = await chain.invoke(fn, args, start, {}, {
      onApplied: (n) => this._bumpStat(n, 'invocations'),
      onSkipped: (n) => this._bumpStat(n, 'skipped'),
      onHookError: (n) => this._bumpStat(n, 'hookErrors'),
    });
    const finished = { ...trace, durationMs: this._clock.now() - start };
    this._record(memberName, finished);
    return finished;
  }

  /* ---------------------------------------------------------------- */
  /* Introspection                                                     */
  /* ---------------------------------------------------------------- */

  /** Which decorators wrap what — per registration. */
  describe(): DecorationMetadata[] {
    return this._registry.describe();
  }

  usageStats(): DecoratorUsageStats[] {
    return this._registry.usageStats();
  }

  /** Recent invocation traces, oldest first. */
  recentTraces(limit: number = 100): RecordedInvocation[] {
    const n = Math.min(limit, this._traces.length);
    const out: RecordedInvocation[] = [];
    for (let i = 0; i < n; i++) {
      const idx = (this._traceHead - 1 - i + this._traces.length * 2) % this._traces.length;
      out.push(this._traces[idx] as RecordedInvocation);
    }
    return out.reverse();
  }

  /* ---------------------------------------------------------------- */
  /* Internals                                                         */
  /* ---------------------------------------------------------------- */

  private _bumpStat(name: string, field: 'invocations' | 'skipped' | 'hookErrors'): void {
    // Registry telemetry only fires for attach()-built chains. For
    // engine-level `invoke` calls we mirror the same accounting into a
    // shadow table; combinedUsageStats() merges the two views.
    const s = this._shadowStats.get(name) ?? { invocations: 0, skipped: 0, hookErrors: 0 };
    s[field] += 1;
    this._shadowStats.set(name, s);
  }

  private readonly _shadowStats = new Map<
    string,
    { invocations: number; skipped: number; hookErrors: number }
  >();

  /** Shadow stats merged with registry stats for engine-level invocations. */
  combinedUsageStats(): DecoratorUsageStats[] {
    const base = this._registry.usageStats();
    return base.map((s) => {
      const shadow = this._shadowStats.get(s.name);
      if (!shadow) {
        return s;
      }
      return {
        ...s,
        invocations: s.invocations + shadow.invocations,
        skipped: s.skipped + shadow.skipped,
        hookErrors: s.hookErrors + shadow.hookErrors,
      };
    });
  }

  private _record(memberName: string, trace: InvocationTrace): void {
    const entry: RecordedInvocation = {
      ...trace,
      memberName,
      at: this._clock.now(),
    };
    if (this._traces.length < this._traceCapacity) {
      this._traces.push(entry);
    } else {
      this._traces[this._traceHead] = entry;
    }
    this._traceHead = (this._traceHead + 1) % this._traceCapacity;
  }
}
