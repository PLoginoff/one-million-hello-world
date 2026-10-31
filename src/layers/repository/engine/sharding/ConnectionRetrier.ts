/**
 * ConnectionRetrier — exponential backoff with jitter + classification.
 *
 * Retrying a failed operation is easy; retrying it CORRECTLY is not:
 *
 *   - Thundering herd: when a database fails over, every client retries at
 *     once. Without jitter all retries land in the same millisecond and the
 *     recovering primary gets DDoSed. Full jitter (AWS's recommendation)
 *     spreads attempts uniformly across the backoff window.
 *
 *   - Error classification: a unique-violation is permanent — retrying just
 *     delays the inevitable failure. A connection-reset is transient — the
 *     pooler bounced mid-query. `classify` decides; non-retryable errors
 *     surface immediately.
 *
 *   - Truncated backoff: delay = min(cap, base · factor^n). Uncapped growth
 *     turns a 30s outage into minutes of tail latency after the DB recovers.
 *
 * The retry loop is async and the sleep is injectable (`sleep` defaults to a
 * real timer but tests pass a no-op) — timing is fully deterministic.
 *
 * @module RepositoryLayer/Engine/Sharding
 */

import { RetryExhaustedError } from './types';

/** How a thrown error should be treated. */
export type ErrorClass = 'transient' | 'permanent' | 'unknown';

export interface RetryOptions {
  /** Max total attempts including the first (>= 1). Default 4. */
  readonly maxAttempts?: number;
  /** First-retry delay (ms). Default 50. */
  readonly baseDelayMs?: number;
  /** Multiplier per attempt. Default 2 (exponential). */
  readonly factor?: number;
  /** Hard cap on any single delay (ms). Default 2000. */
  readonly maxDelayMs?: number;
  /**
   * Jitter mode:
   *   'full'    → delay = U(0, computed)   — best spread, longest expected wait
   *   'equal'   → delay = c/2 + U(0, c/2)  — AWS "equal jitter", halves variance
   *   'none'    → delay = computed         — deterministic, for tests
   */
  readonly jitter?: 'full' | 'equal' | 'none';
  /** Random source in [0,1). Injectable for deterministic tests. */
  readonly random?: () => number;
  /** Sleep implementation. Default: real setTimeout promise. */
  readonly sleep?: (ms: number) => Promise<void>;
  /**
   * Error classifier — maps a thrown error to transient/permanent.
   * Default: `RetryableConnectionError` → transient; everything else unknown
   * (retried anyway, since most driver errors are transient).
   */
  readonly classify?: (err: Error) => ErrorClass;
  /** Called before each retry with attempt number (1-based) and delay. */
  readonly onRetry?: (attempt: number, delayMs: number, err: Error) => void;
}

/** Marker error for "this failure is safe to retry" (connection drops, timeouts). */
export class RetryableConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryableConnectionError';
  }
}

export class ConnectionRetrier {
  private readonly opts: Required<Omit<RetryOptions, 'onRetry' | 'classify' | 'sleep'>> &
    Pick<RetryOptions, 'onRetry' | 'classify' | 'sleep'>;

  constructor(options: RetryOptions = {}) {
    this.opts = {
      maxAttempts: Math.max(1, options.maxAttempts ?? 4),
      baseDelayMs: options.baseDelayMs ?? 50,
      factor: options.factor ?? 2,
      maxDelayMs: options.maxDelayMs ?? 2_000,
      jitter: options.jitter ?? 'full',
      random: options.random ?? Math.random,
      sleep: options.sleep,
      classify: options.classify,
      onRetry: options.onRetry,
    };
  }

  /**
   * Runs `fn` with retries. Permanent errors rethrow immediately; transient
   * and unknown errors retry until `maxAttempts`, then throw
   * `RetryExhaustedError` wrapping the last failure.
   */
  async run<R>(fn: () => Promise<R> | R): Promise<R> {
    let lastErr: Error | null = null;
    for (let attempt = 1; attempt <= this.opts.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        const cls = (this.opts.classify ?? defaultClassify)(err);
        if (cls === 'permanent') throw err;
        lastErr = err;
        if (attempt === this.opts.maxAttempts) break;
        const delay = this.delayFor(attempt);
        this.opts.onRetry?.(attempt, delay, err);
        await (this.opts.sleep ?? realSleep)(delay);
      }
    }
    throw new RetryExhaustedError(this.opts.maxAttempts, lastErr as Error);
  }

  /**
   * Truncated exponential backoff with the configured jitter:
   *   computed = min(maxDelayMs, base · factor^(attempt-1))
   *   'full'   → U(0, computed)
   *   'equal'  → computed/2 + U(0, computed/2)
   *   'none'   → computed
   */
  delayFor(attempt: number): number {
    const computed = Math.min(
      this.opts.maxDelayMs,
      this.opts.baseDelayMs * Math.pow(this.opts.factor, attempt - 1)
    );
    switch (this.opts.jitter) {
      case 'none':
        return computed;
      case 'full':
        return this.opts.random() * computed;
      case 'equal':
        return computed / 2 + this.opts.random() * (computed / 2);
    }
  }
}

/**
 * Default classification: explicit `RetryableConnectionError` and the usual
 * driver-level transient signatures are retried; constraint violations and
 * auth failures are permanent.
 */
function defaultClassify(err: Error): ErrorClass {
  if (err instanceof RetryableConnectionError) return 'transient';
  const msg = err.message.toLowerCase();
  if (
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('timeout') ||
    msg.includes('connection terminated') ||
    msg.includes('too many connections') ||
    msg.includes('serialization failure') ||
    msg.includes('deadlock detected')
  ) {
    return 'transient';
  }
  if (
    msg.includes('duplicate key') ||
    msg.includes('unique constraint') ||
    msg.includes('violates foreign key') ||
    msg.includes('syntax error') ||
    msg.includes('permission denied') ||
    msg.includes('authentication failed')
  ) {
    return 'permanent';
  }
  return 'unknown';
}

function realSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
