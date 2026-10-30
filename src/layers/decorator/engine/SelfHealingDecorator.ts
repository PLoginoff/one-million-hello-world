/**
 * SelfHealingDecorator — recreate the inner callable on repeated failure.
 *
 * An `around` decorator that tracks consecutive failures of the inner
 * call. Once failures hit `failureThreshold`, the inner implementation
 * is considered poisoned (leaked resource, wedged connection, corrupted
 * memo state) and a `factory` is invoked to build a fresh inner. The
 * *next* invocation routes to the fresh instance.
 *
 * This is intentionally NOT a retry policy: retries re-invoke the same
 * (possibly wedged) inner; self-healing swaps the inner itself. Combine
 * with a retry decorator further out for transient-fault handling.
 *
 * Additional behavior:
 * - `cooldownMs`: after a swap, at least this long must elapse before
 *   the next swap, preventing thrash when the factory itself produces
 *   unhealthy instances.
 * - `maxSwaps`: optional hard cap on total swaps; when exceeded the
 *   decorator passes through untouched (circuit-open semantics for the
 *   healing mechanism itself).
 * - Half-open probe: after a swap, the next invocation is a "probe" —
 *   if it fails, the failure counter continues accumulating.
 *
 * Injectable clock keeps cooldown tests deterministic.
 *
 * @module DecoratorLayer/Engine
 */

import {
  DecorationContext,
  DecoratorClock,
  IEngineDecorator,
  SystemDecoratorClock,
} from './types';

/**
 * Factory that produces the next inner implementation.
 * Receives the previous implementation (undefined for the first build)
 * and the consecutive-failure count that triggered the swap.
 */
export type InnerFactory<I> = (previous: I | undefined, failures: number) => I;

export interface SelfHealingOptions {
  /** Consecutive failures that trigger a swap. Must be >= 1. */
  readonly failureThreshold: number;
  /** Minimum ms between swaps. 0 = no cooldown. Default 0. */
  readonly cooldownMs?: number;
  /** Hard cap on total swaps; undefined = unlimited. */
  readonly maxSwaps?: number;
  /** Reset the failure counter on success. Default true. */
  readonly resetOnSuccess?: boolean;
  readonly clock?: DecoratorClock;
  /** Called after each swap for observability. */
  readonly onSwap?: (info: SwapInfo) => void;
}

export interface SwapInfo {
  readonly at: number;
  readonly failures: number;
  readonly swapCount: number;
}

/**
 * Runtime-prepared decorator wrapping a mutable inner cell.
 *
 * Usage:
 * ```ts
 * const healer = new SelfHealingDecorator(() => new Service(), {
 *   failureThreshold: 3,
 * });
 * registry.register(healer.decorator);
 * // healer.inner always points at the live implementation.
 * ```
 */
export class SelfHealingDecorator<I extends (args: readonly unknown[]) => unknown> {
  private readonly _factory: InnerFactory<I>;
  private readonly _threshold: number;
  private readonly _cooldownMs: number;
  private readonly _maxSwaps: number | undefined;
  private readonly _resetOnSuccess: boolean;
  private readonly _clock: DecoratorClock;
  private readonly _onSwap: ((info: SwapInfo) => void) | undefined;

  private _inner: I;
  private _consecutiveFailures: number;
  private _swapCount: number;
  private _lastSwapAt: number; // -Infinity → never swapped → no cooldown

  constructor(factory: InnerFactory<I>, options: SelfHealingOptions) {
    if (!Number.isInteger(options.failureThreshold) || options.failureThreshold < 1) {
      throw new RangeError('failureThreshold must be an integer >= 1');
    }
    this._factory = factory;
    this._threshold = options.failureThreshold;
    this._cooldownMs = options.cooldownMs ?? 0;
    this._maxSwaps = options.maxSwaps;
    this._resetOnSuccess = options.resetOnSuccess ?? true;
    this._clock = options.clock ?? new SystemDecoratorClock();
    this._onSwap = options.onSwap;

    this._inner = factory(undefined, 0);
    this._consecutiveFailures = 0;
    this._swapCount = 0;
    this._lastSwapAt = Number.NEGATIVE_INFINITY;
  }

  /** The live inner implementation (may change after swaps). */
  get inner(): I {
    return this._inner;
  }

  get swapCount(): number {
    return this._swapCount;
  }

  get consecutiveFailures(): number {
    return this._consecutiveFailures;
  }

  /**
   * The `IEngineDecorator` to register. `priority` of the returned
   * decorator is 0; configure via `withName`/`withPriority`.
   */
  get decorator(): IEngineDecorator {
    const self = this;
    const around = async (
      ctx: DecorationContext,
      next: () => Promise<unknown>
    ): Promise<unknown> => {
      try {
        const value = await next();
        if (self._resetOnSuccess) {
          self._consecutiveFailures = 0;
        }
        return value;
      } catch (err) {
        self._consecutiveFailures += 1;
        self._maybeHeal();
        throw err;
      }
    };
    return {
      name: 'self-healing',
      priority: 0,
      around,
    };
  }

  /** Named variant of {@link decorator} for multi-healer registries. */
  asDecorator(name: string, priority: number = 0): IEngineDecorator {
    const base = this.decorator;
    return { ...base, name, priority };
  }

  /**
   * Invoke the current inner directly (outside the chain model) —
   * convenience for code that wants healing without a full chain.
   */
  async call(args: readonly unknown[]): Promise<unknown> {
    try {
      const value = await this._inner(args);
      if (this._resetOnSuccess) {
        this._consecutiveFailures = 0;
      }
      return value;
    } catch (err) {
      this._consecutiveFailures += 1;
      this._maybeHeal();
      throw err;
    }
  }

  /**
   * Force a swap regardless of failure count (operator-driven heal,
   * e.g. after a config reload). Cooldown still applies; pass
   * `force: true` to bypass it.
   */
  heal(force: boolean = false): boolean {
    return this._swap(this._consecutiveFailures, force);
  }

  private _maybeHeal(): void {
    if (this._consecutiveFailures < this._threshold) {
      return;
    }
    this._swap(this._consecutiveFailures, false);
  }

  private _swap(failures: number, force: boolean): boolean {
    const now = this._clock.now();
    if (this._maxSwaps !== undefined && this._swapCount >= this._maxSwaps) {
      return false; // healing circuit is open — inner stays as-is
    }
    if (!force && now - this._lastSwapAt < this._cooldownMs) {
      return false;
    }
    const previous = this._inner;
    this._inner = this._factory(previous, failures);
    this._swapCount += 1;
    this._lastSwapAt = now;
    this._consecutiveFailures = 0;
    this._onSwap?.({ at: now, failures, swapCount: this._swapCount });
    return true;
  }
}
