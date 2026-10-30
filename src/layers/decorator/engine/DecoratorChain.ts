/**
 * DecoratorChain — ordered composition of decorators around an invocation.
 *
 * Semantics (onion model):
 *
 *   before hooks run outermost→innermost
 *   around hooks nest outermost→innermost around the raw call
 *   after hooks run innermost→outermost (unwind order)
 *
 * Effective order is decided by `orderDecorators`: a stable sort on
 * `priority` followed by a topological repair pass over `dependsOn`
 * dependency constraints. The result is that for any two decorators
 * A and B where `A.dependsOn` contains `B.name`, B wraps outside A —
 * B's around hook starts earlier and finishes later.
 *
 * Sync fast path: `invoke` returns `InvocationTrace<T> | Promise<…>`.
 * When no decorator declares a `predicate` and every hook + the
 * innermost returns synchronously, the trace is produced with zero
 * promise allocations — this is what lets the proxy preserve a sync
 * method signature. Any hook that returns a thenable seamlessly
 * continues the remainder of the walk asynchronously (each step is a
 * continuation, never a restart — hooks never double-run).
 *
 * Complexity: ordering is O(n log n) for the priority sort plus O(V+E)
 * for the topological pass (Kahn's algorithm), V = decorators,
 * E = dependency edges. Invocation is O(n) in chain length plus the
 * cost of the hooks themselves.
 *
 * @module DecoratorLayer/Engine
 */

import {
  DecorationContext,
  DecoratorOrderingError,
  IEngineDecorator,
  InvocationTrace,
} from './types';

/**
 * Resolve the effective wrap order for a set of decorators.
 *
 * Stage 1 — stable ascending sort on `priority` (lower priority value ⇒
 * outer position, i.e. its hooks begin earlier). JavaScript's Array.sort
 * is specified stable since ES2019, so equal priorities keep insertion
 * order.
 *
 * Stage 2 — Kahn topological pass over `dependsOn` edges. Each edge
 * "d.dependsOn contains p" is rewritten as "p must precede d" (p wraps
 * outside d). Nodes are emitted in priority order among currently
 * available nodes via sorted insertion into the ready list — O(V²)
 * worst case which is fine for decorator counts (tens, not thousands).
 *
 * @param decorators   decorators to order (not mutated)
 * @param tolerateMissing  skip `dependsOn` names not present in the set
 * @returns ordered array, outermost first
 * @throws DecoratorOrderingError on dependency cycles
 */
export function orderDecorators(
  decorators: readonly IEngineDecorator[],
  tolerateMissing: boolean = true
): IEngineDecorator[] {
  // Stage 1: stable priority sort (ascending priority = outermost).
  const sorted = [...decorators].sort((a, b) => a.priority - b.priority);
  const names = new Set(sorted.map((d) => d.name));

  // Build adjacency: edge dependency -> dependent ("dependency runs outside dependent").
  const indegree = new Map<string, number>();
  const edges = new Map<string, string[]>();
  for (const d of sorted) {
    indegree.set(d.name, 0);
    edges.set(d.name, []);
  }
  const missing: string[] = [];
  for (const d of sorted) {
    for (const dep of d.dependsOn ?? []) {
      if (!names.has(dep)) {
        missing.push(`${d.name}:${dep}`);
        continue;
      }
      edges.get(dep)?.push(d.name);
      indegree.set(d.name, (indegree.get(d.name) ?? 0) + 1);
    }
  }
  if (missing.length > 0 && !tolerateMissing) {
    throw new DecoratorOrderingError(missing);
  }

  // Stage 2: Kahn's algorithm, emitting lowest-priority available node first.
  // The `rank` map preserves stage-1 ordering among ready nodes.
  const rank = new Map<string, number>();
  sorted.forEach((d, i) => rank.set(d.name, i));

  const ready: string[] = sorted
    .filter((d) => (indegree.get(d.name) ?? 0) === 0)
    .map((d) => d.name)
    .sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));

  const out: IEngineDecorator[] = [];
  const byName = new Map(sorted.map((d) => [d.name, d]));

  while (ready.length > 0) {
    const name = ready.shift() as string;
    const node = byName.get(name);
    if (node) {
      out.push(node);
    }
    const newlyReady: string[] = [];
    for (const next of edges.get(name) ?? []) {
      const remaining = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, remaining);
      if (remaining === 0) {
        newlyReady.push(next);
      }
    }
    // Merge newly-ready nodes keeping rank order (insertion into small array).
    for (const n of newlyReady) {
      const nRank = rank.get(n) ?? 0;
      let idx = ready.length;
      while (idx > 0 && (rank.get(ready[idx - 1] as string) ?? 0) > nRank) {
        idx--;
      }
      ready.splice(idx, 0, n);
    }
  }

  if (out.length !== sorted.length) {
    // Whatever didn't emit is part of (or downstream of) a cycle.
    const emitted = new Set(out.map((d) => d.name));
    const cycle = sorted.filter((d) => !emitted.has(d.name)).map((d) => d.name);
    throw new DecoratorOrderingError(cycle);
  }
  return out;
}

/** Telemetry hooks fired during invocation. */
export interface ChainTelemetry {
  onApplied?: (name: string) => void;
  onSkipped?: (name: string) => void;
  onHookError?: (name: string) => void;
}

/** Result of `invoke` — synchronous when the whole chain is sync. */
export type MaybeAsyncTrace<T> = InvocationTrace<T> | Promise<InvocationTrace<T>>;

/**
 * A built, immutable chain for one member of one target.
 *
 * Construction takes an already-ordered decorator list (from
 * `orderDecorators`); each invocation evaluates predicates fresh so
 * conditional decorators can vary per call.
 */
export class DecoratorChain {
  private readonly _ordered: readonly IEngineDecorator[];
  private readonly _memberName: string;
  /** Precomputed: true when any decorator declares a predicate. */
  private readonly _hasPredicates: boolean;

  constructor(memberName: string, decorators: readonly IEngineDecorator[]) {
    this._memberName = memberName;
    this._ordered = decorators;
    this._hasPredicates = decorators.some((d) => d.predicate !== undefined);
  }

  /** Decorator names in effective wrap order (outermost first). */
  get decoratorNames(): readonly string[] {
    return this._ordered.map((d) => d.name);
  }

  get size(): number {
    return this._ordered.length;
  }

  /** True when any decorator has a predicate (forces the async path). */
  get hasPredicates(): boolean {
    return this._hasPredicates;
  }

  /**
   * Invoke `innermost` through the chain.
   *
   * Returns a plain `InvocationTrace` when the entire walk is
   * synchronous (no predicates, no hook returning a thenable), a
   * Promise otherwise. Callers that need a uniform async surface just
   * `await` the result; callers preserving sync signatures (the proxy
   * factory) check `isThenable` on the return value.
   *
   * @param innermost  raw call: receives (possibly rewritten) args.
   * @param args       initial arguments.
   * @param now        clock reading for `ctx.startedAt`.
   * @param metadata   opaque caller metadata copied to the context.
   */
  invoke<T>(
    innermost: (args: readonly unknown[]) => Promise<T> | T,
    args: readonly unknown[],
    now: number,
    metadata: Record<string, unknown> = {},
    telemetry: ChainTelemetry = {}
  ): MaybeAsyncTrace<T> {
    const ctx = this._newContext(args, now, metadata);

    if (!this._hasPredicates) {
      // Fast path: everyone is active.
      const active = this._ordered;
      for (const d of active) {
        telemetry.onApplied?.(d.name);
      }
      return this._run(ctx, active, [], innermost, telemetry, 0);
    }

    // Slow path: evaluate predicates (possibly async), then run.
    return this._selectActive(ctx).then((sel) => {
      for (const d of sel.active) {
        telemetry.onApplied?.(d.name);
      }
      for (const n of sel.skipped) {
        telemetry.onSkipped?.(n);
      }
      if (sel.errors.length > 0) {
        for (const n of sel.errors) {
          telemetry.onHookError?.(n);
        }
      }
      return this._runAsync(ctx, sel.active, sel.skipped, innermost, telemetry, 0);
    });
  }

  /* ---------------------------------------------------------------- */
  /* Predicate evaluation (async only)                                 */
  /* ---------------------------------------------------------------- */

  private async _selectActive(ctx: DecorationContext): Promise<{
    active: IEngineDecorator[];
    skipped: string[];
    errors: string[];
  }> {
    const active: IEngineDecorator[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];
    for (const d of this._ordered) {
      let passes = true;
      if (d.predicate) {
        try {
          passes = await d.predicate(ctx);
        } catch {
          // A throwing predicate means "do not apply" — a conditional
          // decorator must not break the invocation merely because its
          // condition could not be evaluated.
          passes = false;
          errors.push(d.name);
        }
      }
      if (passes) {
        active.push(d);
      } else {
        skipped.push(d.name);
      }
    }
    return { active, skipped, errors };
  }

  private async _runAsync<T>(
    ctx: DecorationContext,
    active: readonly IEngineDecorator[],
    skipped: readonly string[],
    innermost: (args: readonly unknown[]) => Promise<T> | T,
    telemetry: ChainTelemetry,
    fromBefore: number
  ): Promise<InvocationTrace<T>> {
    const r = this._run(ctx, active, skipped, innermost, telemetry, fromBefore);
    return isThenable(r) ? r : r;
  }

  /* ---------------------------------------------------------------- */
  /* Core walk — maybe-synchronous                                     */
  /* ---------------------------------------------------------------- */

  /**
   * Run before→call→after for `active`. `fromBefore` is the index in
   * `active` to resume before-hooks from (used by async continuations).
   * Returns a trace or a Promise of one; NEVER re-runs a completed step.
   */
  private _run<T>(
    ctx: DecorationContext,
    active: readonly IEngineDecorator[],
    skipped: readonly string[],
    innermost: (args: readonly unknown[]) => Promise<T> | T,
    telemetry: ChainTelemetry,
    fromBefore: number
  ): MaybeAsyncTrace<T> {
    // 1. before hooks, outermost → innermost.
    for (let i = fromBefore; i < active.length; i++) {
      const d = active[i] as IEngineDecorator;
      if (!d.before) continue;
      try {
        const r = d.before(ctx);
        if (isThenable(r)) {
          // Continue remaining before hooks when this one resolves.
          return Promise.resolve(r).then(
            () => this._run(ctx, active, skipped, innermost, telemetry, i + 1),
            (err: unknown) => {
              telemetry.onHookError?.(d.name);
              ctx.error = err;
              return this._runAfter(ctx, active, skipped, telemetry, active.length - 1);
            }
          );
        }
      } catch (err) {
        // A throwing before hook aborts the call but still runs after
        // hooks so observers see the error.
        telemetry.onHookError?.(d.name);
        ctx.error = err;
        return this._runAfter(ctx, active, skipped, telemetry, active.length - 1);
      }
    }

    // 2. composed around/innermost call.
    const callTarget = (): unknown => innermost(ctx.args);
    const composed = active.reduceRight<() => unknown>(
      (next, decorator) => {
        if (!decorator.around) {
          return next;
        }
        const around = decorator.around;
        return () => {
          try {
            return around(ctx, liftNext(next));
          } catch (err) {
            telemetry.onHookError?.(decorator.name);
            throw err;
          }
        };
      },
      callTarget
    );

    let callResult: unknown;
    let callThrew = false;
    try {
      callResult = composed();
    } catch (err) {
      ctx.error = err;
      callThrew = true;
    }
    if (!callThrew) {
      if (isThenable(callResult)) {
        return Promise.resolve(callResult).then(
          (v) => {
            ctx.result = v;
            return this._runAfter(ctx, active, skipped, telemetry, active.length - 1);
          },
          (err: unknown) => {
            ctx.error = err;
            return this._runAfter(ctx, active, skipped, telemetry, active.length - 1);
          }
        );
      }
      ctx.result = callResult;
    }

    // 3. after hooks — see _runAfter.
    return this._runAfter(ctx, active, skipped, telemetry, active.length - 1);
  }

  /**
   * after hooks, innermost → outermost (unwind). A throwing after hook
   * replaces ctx.error only if none is pending — the original error is
   * more diagnostic than the cleanup failure.
   */
  private _runAfter<T>(
    ctx: DecorationContext,
    active: readonly IEngineDecorator[],
    skipped: readonly string[],
    telemetry: ChainTelemetry,
    from: number
  ): MaybeAsyncTrace<T> {
    for (let i = from; i >= 0; i--) {
      const d = active[i] as IEngineDecorator;
      if (!d.after) continue;
      try {
        const r = d.after(ctx);
        if (isThenable(r)) {
          return Promise.resolve(r).then(
            () => this._runAfter(ctx, active, skipped, telemetry, i - 1),
            (err: unknown) => {
              telemetry.onHookError?.(d.name);
              if (ctx.error === undefined) {
                ctx.error = err;
              }
              return this._runAfter(ctx, active, skipped, telemetry, i - 1);
            }
          );
        }
      } catch (err) {
        telemetry.onHookError?.(d.name);
        if (ctx.error === undefined) {
          ctx.error = err;
        }
      }
    }
    return this._finalize<T>(ctx, active, skipped);
  }

  private _newContext(
    args: readonly unknown[],
    now: number,
    metadata: Record<string, unknown>
  ): DecorationContext {
    return {
      memberName: this._memberName,
      args: [...args],
      errorHandled: false,
      state: new Map<string, unknown>(),
      startedAt: now,
      metadata,
    };
  }

  private _finalize<T>(
    ctx: DecorationContext,
    active: readonly IEngineDecorator[],
    skipped: readonly string[]
  ): InvocationTrace<T> {
    const success = ctx.error === undefined || ctx.errorHandled;
    return {
      success,
      applied: active.map((d) => d.name),
      skipped,
      durationMs: 0, // patched by caller who owns the clock
      ...(success ? { value: ctx.result as T } : { error: ctx.error }),
    };
  }
}

function isThenable(v: unknown): v is PromiseLike<unknown> {
  return (
    (typeof v === 'object' || typeof v === 'function') &&
    v !== null &&
    typeof (v as { then?: unknown }).then === 'function'
  );
}

/**
 * Adapt a synchronous `next` continuation to the `() => Promise` shape
 * hooks expect. Around hooks that `await next()` work unchanged; hooks
 * that call `next()` and return the promise get a real promise whose
 * resolution carries the (possibly synchronous) inner result — the
 * caller awaits the composed value so nothing double-runs.
 */
function liftNext(next: () => unknown): () => Promise<unknown> {
  return () => Promise.resolve().then(next);
}
