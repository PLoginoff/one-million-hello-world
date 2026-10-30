/**
 * FallbackChain — ordered fallbacks with first-success wins.
 *
 * When a primary operation fails (or its circuit is open), a service
 * often has several degraded paths: secondary endpoint → local cache →
 * static default. This chain tries them in order and returns the first
 * acceptable result:
 *
 *   primary → [fallback1 → fallback2 → fallback3]
 *             first one that "succeeds" wins; all fail → throw.
 *
 * Semantics:
 *   - "Acceptable" is decided by an optional `accept` predicate — a
 *     fallback can *return* a value that's still unacceptable (e.g. a
 *     stale cache entry older than some bound) and be skipped.
 *   - Each attempt (primary + fallbacks) is recorded with its error so
 *     `run` can return a detailed `ChainResult` or throw
 *     `FallbackChainExhaustedError` carrying the last failure.
 *   - `run` short-circuits: the first success stops the chain (no
 *     speculative parallelism — fallbacks may have side effects).
 *   - Optional `shouldFallback` decides whether a given error even
 *     enters the chain (e.g. don't fall back on auth errors — they fail
 *     everywhere).
 *
 * Complexity: O(#fallbacks) worst case; short-circuit on success.
 *
 * @module CircuitBreakerLayer/Engine
 */

import { FallbackChainExhaustedError } from './types';

/** A single fallback step. */
export type FallbackFunction<T> = () => Promise<T> | T;

/** Decides whether a produced value is acceptable; default: any value. */
export type AcceptPredicate<T> = (value: T) => boolean;

/** Decides whether an error should enter the fallback chain at all. */
export type ShouldFallbackPredicate = (err: unknown) => boolean;

export interface FallbackChainOptions {
  accept?: AcceptPredicate<unknown>;
  shouldFallback?: ShouldFallbackPredicate;
}

export interface ChainAttempt {
  index: number; // 0 = primary, ≥1 = fallback[i-1]
  label: string;
  ok: boolean;
  error?: unknown;
  /** Set when a value was produced but rejected by `accept`. */
  rejectedValue?: boolean;
}

export interface ChainResult<T> {
  value: T;
  /** Index of the step that produced the value (0 = primary). */
  servedBy: number;
  attempts: ChainAttempt[];
}

interface LabeledFallback<T> {
  label: string;
  fn: FallbackFunction<T>;
}

export class FallbackChain {
  private readonly _accept: AcceptPredicate<unknown> | undefined;
  private readonly _shouldFallback: ShouldFallbackPredicate | undefined;

  constructor(options: FallbackChainOptions = {}) {
    this._accept = options.accept as AcceptPredicate<unknown> | undefined;
    this._shouldFallback = options.shouldFallback;
  }

  /**
   * Run primary then fallbacks until one produces an acceptable value.
   * Throws `FallbackChainExhaustedError` when everything fails, or the
   * primary error immediately when `shouldFallback` vetoes it.
   */
  async run<T>(primary: FallbackFunction<T>, fallbacks: ReadonlyArray<FallbackFunction<T>>): Promise<T> {
    const result = await this.runDetailed(primary, fallbacks);
    return result.value;
  }

  /** Same as `run` but returns the attempt log. */
  async runDetailed<T>(
    primary: FallbackFunction<T>,
    fallbacks: ReadonlyArray<FallbackFunction<T>>,
  ): Promise<ChainResult<T>> {
    const labeled: LabeledFallback<T>[] = [
      { label: 'primary', fn: primary },
      ...fallbacks.map((fn, i) => ({ label: `fallback[${i}]`, fn })),
    ];
    const attempts: ChainAttempt[] = [];
    let lastError: unknown = undefined;

    for (let i = 0; i < labeled.length; i++) {
      const step = labeled[i];
      try {
        const value = await step.fn();
        if (this._accept && !this._accept(value)) {
          attempts.push({ index: i, label: step.label, ok: false, rejectedValue: true });
          lastError = new Error(`${step.label} produced an unacceptable value`);
          continue;
        }
        attempts.push({ index: i, label: step.label, ok: true });
        return { value, servedBy: i, attempts };
      } catch (err: unknown) {
        attempts.push({ index: i, label: step.label, ok: false, error: err });
        lastError = err;
        // A vetoed primary error skips the whole chain.
        if (i === 0 && this._shouldFallback && !this._shouldFallback(err)) {
          throw err;
        }
      }
    }
    throw new FallbackChainExhaustedError(attempts.length, lastError);
  }

  /**
   * Convenience: chain through value-providing steps (not thunks).
   * Stops at the first non-rejected value. For purely static fallback
   * ladders like "cache → default".
   */
  async firstAcceptable<T>(candidates: ReadonlyArray<() => Promise<T | undefined> | T | undefined>): Promise<T | undefined> {
    for (let i = 0; i < candidates.length; i++) {
      const v = await candidates[i]();
      if (v !== undefined && (!this._accept || this._accept(v))) return v;
    }
    return undefined;
  }
}
