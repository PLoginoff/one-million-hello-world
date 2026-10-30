/**
 * Decoration Engine — shared types.
 *
 * This module defines the core vocabulary of the decoration engine:
 * hooks, decorators, ordering constraints, predicates, and introspection
 * metadata. Everything here is pure data + contracts; behavior lives in
 * the sibling modules (chain, registry, proxy factory, engine).
 *
 * Terminology:
 * - "target"    — the object (or function) being decorated.
 * - "decorator" — a named unit of cross-cutting behavior expressed as
 *                 before/around/after hooks.
 * - "chain"     — an ordered sequence of decorators applied to one
 *                 invocation of one target member.
 *
 * @module DecoratorLayer/Engine
 */

import { DecoratorError } from '../utils/DecoratorError';

/* ------------------------------------------------------------------ */
/* Clock                                                               */
/* ------------------------------------------------------------------ */

/**
 * Injectable clock so timing-dependent behavior (latency recording,
 * self-healing cooldowns) is deterministic under test.
 */
export interface DecoratorClock {
  /** Milliseconds since an arbitrary epoch. Monotonicity required. */
  now(): number;
}

/** Default wall-clock implementation. */
export class SystemDecoratorClock implements DecoratorClock {
  now(): number {
    return Date.now();
  }
}

/* ------------------------------------------------------------------ */
/* Invocation context                                                  */
/* ------------------------------------------------------------------ */

/**
 * Mutable context threaded through every hook for a single invocation.
 *
 * `args` may be rewritten by `before` hooks (argument transformation);
 * `result` is populated after the innermost call returns and may be
 * rewritten by `after` hooks (result transformation). `state` is a
 * scratch bag decorators can use to pass data between their own hooks
 * (e.g. a timing decorator stashing a start timestamp).
 */
export interface DecorationContext<TArgs extends readonly unknown[] = readonly unknown[]> {
  /** Name of the target member being invoked ('apply' for functions). */
  readonly memberName: string;
  /** Arguments (possibly rewritten by before hooks). */
  args: TArgs;
  /** Result of the innermost call, once available. */
  result?: unknown;
  /** Error thrown by the innermost call or by an around hook. */
  error?: unknown;
  /** Whether `error` has been handled (swallowed) by an after hook. */
  errorHandled: boolean;
  /** Scratch space shared across hooks of this invocation. */
  readonly state: Map<string, unknown>;
  /** Epoch-ms timestamp (from the engine clock) when invocation began. */
  readonly startedAt: number;
  /** Opaque metadata attached to the invocation by the caller. */
  readonly metadata: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/* Hook signatures                                                     */
/* ------------------------------------------------------------------ */

/**
 * Runs before the innermost call. May mutate `ctx.args` to transform
 * arguments. Throwing aborts the invocation (after hooks still run so
 * they can observe the error).
 */
export type BeforeHook = (ctx: DecorationContext) => void | Promise<void>;

/**
 * Wraps the innermost call. Receives a `next` continuation that invokes
 * the remainder of the chain (or the raw target if this is the last
 * around hook). Calling `next` zero times short-circuits (memoization,
 * veto); calling it more than once is permitted (retry decorators) but
 * the innermost call will run per invocation of `next`.
 *
 * The returned value becomes `ctx.result` for outer hooks.
 */
export type AroundHook = (
  ctx: DecorationContext,
  next: () => Promise<unknown>
) => Promise<unknown>;

/**
 * Runs after the innermost call settles — success or failure. May
 * inspect/replace `ctx.result` (assign a new value) or observe
 * `ctx.error`. Setting `ctx.errorHandled = true` swallows the error so
 * the outer chain resolves normally; `ctx.result` should then be set.
 */
export type AfterHook = (ctx: DecorationContext) => void | Promise<void>;

/* ------------------------------------------------------------------ */
/* Decorator contract                                                  */
/* ------------------------------------------------------------------ */

/**
 * A named unit of cross-cutting behavior.
 *
 * Any subset of hooks may be provided. `predicate` makes the decorator
 * *conditional*: when it returns false for a given context the decorator
 * is skipped entirely for that invocation (hooks not run, not recorded
 * as applied).
 */
export interface IEngineDecorator {
  /** Unique name within a registry/chain. */
  readonly name: string;
  /**
   * Explicit priority — lower numbers run *closer* to the target for
   * around hooks (their before runs earlier in absolute order).
   * Defaults to 0. Ties break on insertion order (stable sort).
   */
  readonly priority: number;
  /**
   * Names of decorators that must wrap *outside* this decorator — i.e.
   * dependencies' around hooks run before this decorator's around hook.
   * Used by the dependency topological sort. Missing dependencies are
   * tolerated at chain-build time but reported via `listMissing`.
   * (`dependsOn` reads naturally: "this decorator depends on X" ⇒ X
   * wraps outside this one.)
   */
  readonly dependsOn?: readonly string[];
  /** Conditional application. Await-aware. */
  readonly predicate?: (ctx: DecorationContext) => boolean | Promise<boolean>;
  readonly before?: BeforeHook;
  readonly around?: AroundHook;
  readonly after?: AfterHook;
}

/** Structural type-guard for IEngineDecorator (no `any`). */
export function isEngineDecorator(value: unknown): value is IEngineDecorator {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return typeof v.name === 'string' && typeof v.priority === 'number';
}

/* ------------------------------------------------------------------ */
/* Ordering                                                            */
/* ------------------------------------------------------------------ */

/**
 * Dependency-cycle error thrown when `dependsOn` constraints cannot be
 * topologically satisfied (e.g. a depends on b, b depends on a).
 */
export class DecoratorOrderingError extends DecoratorError {
  readonly cycle: readonly string[];

  constructor(cycle: readonly string[]) {
    super(
      'ORDERING_CYCLE',
      `Decorator ordering contains a cycle: ${cycle.join(' -> ')}`,
      400
    );
    this.name = 'DecoratorOrderingError';
    this.cycle = cycle;
  }
}

/* ------------------------------------------------------------------ */
/* Introspection metadata                                              */
/* ------------------------------------------------------------------ */

/** Snapshot of how a single target is currently decorated. */
export interface DecorationMetadata {
  /** Registry-issued id for the target registration. */
  readonly registrationId: string;
  /** Stable label for the target (constructor name or caller-provided). */
  readonly targetLabel: string;
  /** Decorator names in effective wrap order (outermost first). */
  readonly decorators: readonly string[];
  /** Per-member chains when decoration is member-scoped; empty when the
   * whole target was wrapped. */
  readonly members: Readonly<Record<string, readonly string[]>>;
  /** Epoch-ms when this registration was created. */
  readonly attachedAt: number;
}

/** Per-decorator usage stats kept by the registry. */
export interface DecoratorUsageStats {
  readonly name: string;
  /** Registrations currently using this decorator. */
  readonly registrations: number;
  /** Invocations where the predicate passed and hooks ran. */
  readonly invocations: number;
  /** Invocations skipped because the predicate failed. */
  readonly skipped: number;
  /** Errors observed in this decorator's own hooks. */
  readonly hookErrors: number;
}

/* ------------------------------------------------------------------ */
/* Engine options                                                      */
/* ------------------------------------------------------------------ */

export interface DecorationEngineOptions {
  readonly clock?: DecoratorClock;
  /**
   * When true (default), `dependsOn` constraints that reference unknown
   * decorator names are ignored instead of throwing at chain build time.
   */
  readonly tolerateMissingDependencies?: boolean;
}

/**
 * Result of one decorated invocation, with trace information useful for
 * diagnostics and tests.
 */
export interface InvocationTrace<T = unknown> {
  readonly success: boolean;
  readonly value?: T;
  readonly error?: unknown;
  /** Decorator names that actually ran (predicate passed). */
  readonly applied: readonly string[];
  /** Decorator names skipped by predicate. */
  readonly skipped: readonly string[];
  /** Wall duration (engine clock) of the whole chain in ms. */
  readonly durationMs: number;
}
