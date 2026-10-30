/**
 * InterceptorChain
 *
 * Executes an ordered pipeline of `before`/`after` hooks around a target
 * invocation, with deterministic short-circuit and error-unwind semantics.
 *
 * Semantics (a hybrid of servlet filters and AOP advice):
 *
 *   before phase — interceptors run in registration order. Each hook may
 *     return `{ kind: 'continue' }` (or nothing-required equivalents) or
 *     `{ kind: 'shortCircuit', value }`, which skips the target entirely.
 *     If a `before` hook throws, the target is skipped and the thrown error
 *     becomes the outcome.
 *
 *   target phase — invoked at most once, only when no short-circuit and no
 *     `before` error occurred.
 *
 *   after phase — runs in REVERSE registration order over the "participated"
 *     set: every interceptor whose `before` hook ran to completion (a
 *     short-circuiting interceptor counts as completed; a throwing one does
 *     not). Interceptors without a `before` hook always participate.
 *     Each `after` receives the current outcome `{ value?, error? }` and may
 *     return a replacement — enabling response decoration, error wrapping,
 *     and error recovery (replacing `{ error }` with `{ value }`).
 *     If an `after` hook throws, the outcome is replaced by that error.
 *
 * Complexity: O(n) hooks per invocation where n = interceptor count.
 * Memory: O(n) for the participation stack.
 *
 * @module ProxyLayer/Engine
 */

import {
  Interceptor,
  InterceptorDecision,
  Invocation,
} from './types';

/**
 * Outcome carried through the after phase.
 */
interface Outcome {
  value?: unknown;
  error?: unknown;
}

/**
 * Result returned by `InterceptorChain.run`.
 */
export interface ChainResult {
  /** Final value (after all after-hook transformations). */
  readonly value: unknown;
  /** True when the target was bypassed by a short-circuit decision. */
  readonly shortCircuited: boolean;
  /** Names of interceptors whose before hooks ran, in execution order. */
  readonly beforeExecuted: readonly string[];
  /** Names of interceptors whose after hooks ran, in execution order. */
  readonly afterExecuted: readonly string[];
}

/**
 * Continue decision singleton.
 */
export const CONTINUE: InterceptorDecision = { kind: 'continue' };

/**
 * Convenience factory for a short-circuit decision.
 */
export function shortCircuit(value: unknown): InterceptorDecision {
  return { kind: 'shortCircuit', value };
}

/**
 * An immutable, composable interceptor chain.
 *
 * Instances are cheap to extend: `use()` returns a NEW chain sharing the
 * interceptor array prefix (structural sharing via slice-on-write).
 */
export class InterceptorChain {
  private readonly _interceptors: readonly Interceptor[];

  constructor(interceptors: readonly Interceptor[] = []) {
    this._interceptors = interceptors;
  }

  /**
   * Number of registered interceptors.
   */
  get size(): number {
    return this._interceptors.length;
  }

  /**
   * Names of registered interceptors in order.
   */
  get names(): readonly string[] {
    return this._interceptors.map((i) => i.name);
  }

  /**
   * Returns a new chain with `interceptor` appended.
   */
  use(interceptor: Interceptor): InterceptorChain {
    return new InterceptorChain([...this._interceptors, interceptor]);
  }

  /**
   * Returns a new chain with `interceptor` prepended — runs first in the
   * before phase and last in the after phase.
   */
  useFirst(interceptor: Interceptor): InterceptorChain {
    return new InterceptorChain([interceptor, ...this._interceptors]);
  }

  /**
   * Returns a new chain with the named interceptor removed (all occurrences).
   * No-op when the name is absent.
   */
  remove(name: string): InterceptorChain {
    return new InterceptorChain(this._interceptors.filter((i) => i.name !== name));
  }

  /**
   * Executes the chain around `invokeTarget`.
   *
   * @param invocation - The invocation frame passed to every hook.
   * @param invokeTarget - Thunk performing the real work. Invoked at most once.
   * @returns The final chain result.
   * @throws The final error when the outcome still contains one after unwind.
   */
  async run(invocation: Invocation, invokeTarget: () => Promise<unknown>): Promise<ChainResult> {
    const beforeExecuted: string[] = [];
    const participated: Interceptor[] = [];
    const outcome: Outcome = {};
    let shortCircuited = false;

    // ---- before phase --------------------------------------------------
    for (const interceptor of this._interceptors) {
      if (!interceptor.before) {
        participated.push(interceptor);
        continue;
      }
      try {
        const decision = await interceptor.before(invocation);
        beforeExecuted.push(interceptor.name);
        participated.push(interceptor);
        if (decision.kind === 'shortCircuit') {
          outcome.value = decision.value;
          shortCircuited = true;
          break;
        }
      } catch (error) {
        // The throwing interceptor does NOT participate in the after phase.
        outcome.error = error;
        break;
      }
    }

    // ---- target phase --------------------------------------------------
    if (!shortCircuited && outcome.error === undefined) {
      try {
        outcome.value = await invokeTarget();
      } catch (error) {
        outcome.error = error;
      }
    }

    // ---- after phase (reverse order over participants) ------------------
    const afterExecuted: string[] = [];
    for (let i = participated.length - 1; i >= 0; i--) {
      const interceptor = participated[i];
      if (!interceptor.after) {
        continue;
      }
      try {
        const replacement = await interceptor.after(invocation, { value: outcome.value, error: outcome.error });
        if (replacement !== undefined) {
          outcome.value = replacement.value;
          outcome.error = replacement.error;
        }
        afterExecuted.push(interceptor.name);
      } catch (error) {
        outcome.value = undefined;
        outcome.error = error;
        afterExecuted.push(interceptor.name);
      }
    }

    if (outcome.error !== undefined) {
      throw outcome.error;
    }

    return {
      value: outcome.value,
      shortCircuited,
      beforeExecuted,
      afterExecuted,
    };
  }

  // ---------------------------------------------------------------------
  // Interceptor factories — common hooks expressed as data
  // ---------------------------------------------------------------------

  /**
   * Builds an interceptor that logs every invocation to `sink`.
   */
  static logging(sink: (line: string, invocation: Invocation) => void): Interceptor {
    return {
      name: 'logging',
      before(invocation: Invocation): InterceptorDecision {
        sink(`-> ${invocation.method}(${invocation.args.length} args)`, invocation);
        return CONTINUE;
      },
      after(invocation: Invocation, outcome: Outcome): Outcome {
        sink(
          outcome.error !== undefined
            ? `<- ${invocation.method} threw ${String(outcome.error)}`
            : `<- ${invocation.method} returned`,
          invocation
        );
        return outcome;
      },
    };
  }

  /**
   * Builds an interceptor enforcing a minimum inter-call delay per method —
   * a simple fixed-interval rate limiter.
   */
  static rateLimit(minIntervalMs: number, clock: () => number): Interceptor {
    const lastCallAt = new Map<string, number>();
    return {
      name: 'rateLimit',
      before(invocation: Invocation): InterceptorDecision {
        const now = clock();
        const last = lastCallAt.get(invocation.method);
        if (last !== undefined && now - last < minIntervalMs) {
          throw new Error(
            `Rate limit: '${invocation.method}' called ${now - last}ms after previous call (min ${minIntervalMs}ms)`
          );
        }
        lastCallAt.set(invocation.method, now);
        return CONTINUE;
      },
    };
  }

  /**
   * Builds an interceptor adding a per-call timeout via `Promise.race`.
   * On expiry the invocation short-circuits into an error outcome by throwing.
   */
  static timing(mark: (method: string, durationMs: number) => void, clock: () => number): Interceptor {
    return {
      name: 'timing',
      before(): InterceptorDecision {
        return CONTINUE;
      },
      after(invocation: Invocation, outcome: Outcome): Outcome {
        mark(invocation.method, clock() - invocation.startedAt);
        return outcome;
      },
    };
  }
}
