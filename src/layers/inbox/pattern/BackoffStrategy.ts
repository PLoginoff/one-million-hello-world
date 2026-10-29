/**
 * BackoffStrategy — retry delay computation.
 *
 * delay(attempt) = min(cap, base * factor^(attempt-1)) * (1 ± jitter)
 *
 * Attempt numbering: the Nth *failure* (attempts == N after acquire)
 * schedules retry N+1 at delay(N).
 *
 * Jitter uses a supplied RNG so tests are deterministic. Full jitter
 * (uniform in [0, delay]) vs decorrelated-equal-jitter ([delay*(1-j), delay*(1+j)])
 * — this implementation uses symmetric equal jitter, which bounds both
 * the worst-case thundering herd and the fastest retry.
 *
 * @module Inbox/Pattern
 */

import { InboxRetryConfig, DEFAULT_RETRY } from './types';

export class BackoffStrategy {
  private readonly _config: InboxRetryConfig;
  private readonly _rng: () => number;

  constructor(config?: Partial<InboxRetryConfig>, rng: () => number = Math.random) {
    this._config = { ...DEFAULT_RETRY, ...config };
    this._rng = rng;
  }

  /** Delay in ms after the Nth failed attempt (N >= 1). */
  delay(attempt: number): number {
    const { backoffBaseMs, backoffFactor, backoffCapMs, jitterFraction } = this._config;
    const exp = Math.min(backoffCapMs, backoffBaseMs * Math.pow(backoffFactor, Math.max(0, attempt - 1)));
    if (jitterFraction <= 0) return Math.floor(exp);
    const jitter = (this._rng() * 2 - 1) * jitterFraction; // [-j, +j]
    return Math.max(0, Math.floor(exp * (1 + jitter)));
  }

  /** Should a record with `attempts` prior tries be parked now? */
  shouldPark(attempts: number): boolean {
    return attempts >= this._config.maxAttempts;
  }

  get maxAttempts(): number {
    return this._config.maxAttempts;
  }
}
