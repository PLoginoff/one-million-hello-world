/**
 * DecorrelatedJitter — AWS's recommended backoff ("Full Jitter" and
 * "Decorrelated Jitter" from the AWS Architecture Blog).
 *
 * Equal-jitter (`delay/2 + rand(delay/2)`) and exponential-no-jitter
 * both suffer correlated collisions: many clients retrying at the same
 * computed delay re-converge on the same schedule. Decorrelated jitter
 * computes:
 *
 *   sleep_n = min(cap, rand(base, sleep_{n-1} * 3))
 *
 * Each client's next delay depends on its own previous draw, so a
 * fleet of retrying clients stays de-synchronized — no thundering
 * herd even without a shared coordinator.
 *
 * Also provided:
 *   - `fullJitter`: delay = rand(0, min(cap, base·2^n)) — the simplest
 *     correct backoff, good default;
 *   - `equalJitter`: delay = (min(cap, base·2^n)/2) + rand(0, that/2);
 *
 * All use the injected RNG for test determinism.
 *
 * @module RetryLayer/Engine
 */

export interface JitterOptions {
  /** Base delay (ms). */
  baseMs: number;
  /** Hard cap on any computed delay (ms). */
  capMs: number;
  /** RNG injection for tests. */
  random?: () => number;
}

export class DecorrelatedJitter {
  private readonly _baseMs: number;
  private readonly _capMs: number;
  private readonly _rand: () => number;

  /** Per-key previous delay for decorrelated mode. */
  private readonly _previous = new Map<string, number>();

  constructor(options: JitterOptions) {
    this._baseMs = Math.max(0, options.baseMs);
    this._capMs = Math.max(this._baseMs, options.capMs);
    this._rand = options.random ?? Math.random;
  }

  /**
   * Decorrelated jitter delay for `key`'s next attempt.
   * Result is stored as that key's previous for the next call.
   */
  next(key: string): number {
    const prev = this._previous.get(key) ?? this._baseMs;
    const low = this._baseMs;
    const high = prev * 3;
    const draw = low + this._rand() * (high - low);
    const delay = Math.min(this._capMs, draw);
    this._previous.set(key, delay);
    return Math.round(delay);
  }

  /** Reset a key's decorrelation state (e.g. after success). */
  reset(key: string): void {
    this._previous.delete(key);
  }

  /** Full jitter for attempt `n` (0-based): rand(0, min(cap, base·2^n)). */
  fullJitter(n: number): number {
    const ceiling = Math.min(this._capMs, this._baseMs * Math.pow(2, Math.max(0, n)));
    return Math.round(this._rand() * ceiling);
  }

  /** Equal jitter for attempt `n`: half deterministic + half random. */
  equalJitter(n: number): number {
    const temp = Math.min(this._capMs, this._baseMs * Math.pow(2, Math.max(0, n)));
    const half = temp / 2;
    return Math.round(half + this._rand() * half);
  }
}
