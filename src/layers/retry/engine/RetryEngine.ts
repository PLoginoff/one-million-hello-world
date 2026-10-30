/**
 * RetryEngine — orchestrates retries with budgets, reason classification,
 * retry-after honoring, and idempotency gates.
 *
 * Each attempt produces an `AttemptFailure` (thrown error, or a response
 * description supplied by the caller's transport adapter). The engine:
 *
 *   1. classifies the failure (timeout | transport | 5xx | 429 | 4xx);
 *   2. refuses when the class is non-retryable (4xx ≠ 429) or the op
 *      is `non-idempotent`;
 *   3. spends a token from the scope's `RetryBudget` — exhausted budget
 *      fails fast with the original error, not a generic one;
 *   4. computes the delay = max(server Retry-After, adaptive backoff);
 *   5. sleeps via an injectable `sleeper` (manual in tests, `setTimeout`
 *      in production);
 *   6. records the attempt and loops.
 *
 * Success path: latency feeds `AdaptiveBackoff.observeSuccess` so the
 * operation's future backoff is calibrated to its real cost.
 *
 * The engine never throws its own error for the final failure — it
 * rethrows the last attempt's error after `maxAttempts`, or a
 * `RetryExhaustedError` wrapping the classification when attempts are
 * cut short by policy.
 *
 * Complexity: O(attempts); per-attempt bookkeeping O(1).
 *
 * @module RetryLayer/Engine
 */

import { AdaptiveBackoff } from './AdaptiveBackoff';
import { RetryAfterParser } from './RetryAfterParser';
import { RetryBudget } from './RetryBudget';
import {
  AttemptFailure,
  ClassifiedFailure,
  Idempotency,
  ManualEngineClock,
  NonIdempotentError,
  RetryBudgetExhaustedError,
  RetryEngineClock,
  RetryReason,
  SystemEngineClock,
} from './types';

/** How the operation signals failure. Throw, or return a failure shape. */
export type OperationResult<T> =
  | { ok: true; value: T }
  | { ok: false; failure: AttemptFailure };

export type RetryableOperation<T> = (attempt: number) => Promise<OperationResult<T>> | OperationResult<T>;

/** Injectable delay; receives ms and the abort of the engine. */
export type Sleeper = (ms: number) => Promise<void>;

const realSleep: Sleeper = (ms) => new Promise((r) => setTimeout(r, ms));

export class RetryExhaustedError extends Error {
  readonly attempts: number;
  readonly lastReason: RetryReason;
  readonly lastError: unknown;

  constructor(attempts: number, lastReason: RetryReason, lastError: unknown) {
    const detail = lastError instanceof Error ? lastError.message : String(lastError ?? 'none');
    super(`Retry exhausted after ${attempts} attempts (last: ${lastReason}; ${detail})`);
    this.name = 'RetryExhaustedError';
    this.attempts = attempts;
    this.lastReason = lastReason;
    this.lastError = lastError;
  }
}

export interface RetryEngineOptions {
  /** Max attempts total (1 = no retry). Default 3. */
  maxAttempts?: number;
  /** Honor Retry-After over adaptive backoff when both exist. Default true. */
  honorRetryAfter?: boolean;
  /** Extra retryable statuses beyond the default 5xx/429 set. */
  retryableStatuses?: readonly number[];
  /** Statuses to treat as definitively non-retryable even if 5xx (e.g. 501). */
  nonRetryableStatuses?: readonly number[];
  sleeper?: Sleeper;
  clock?: RetryEngineClock;
}

export interface AttemptRecord {
  attempt: number;
  classified: ClassifiedFailure;
  delayMs: number;
  /** Tokens spent for this attempt (0 when budget rejected). */
  budgetCost: number;
}

export interface RetryOutcome<T> {
  ok: boolean;
  value?: T;
  attempts: AttemptRecord[];
  /** Set when ok=false; carries the original error when rethrown. */
  finalError?: unknown;
  finalReason?: RetryReason;
  /** True when the budget (not maxAttempts) stopped the retries. */
  budgetStopped: boolean;
  /** True when the op was non-idempotent and retry was refused. */
  nonIdempotentStopped: boolean;
}

/** Default classifier — overridable per-engine. */
export interface FailureClassifier {
  classify(f: AttemptFailure, retryableStatuses: readonly number[], nonRetryableStatuses: readonly number[]): ClassifiedFailure;
}

class DefaultClassifier implements FailureClassifier {
  classify(f: AttemptFailure, retryable: readonly number[], nonRetryable: readonly number[]): ClassifiedFailure {
    const parser = new RetryAfterParser();
    const retryAfterMs = parser.parse(f.retryAfterHeader) ?? undefined;

    if (f.timedOut === true) {
      return { reason: RetryReason.TIMEOUT, retryable: true, retryAfterMs };
    }
    if (typeof f.statusCode === 'number') {
      const s = f.statusCode;
      if (nonRetryable.includes(s)) {
        return { reason: RetryReason.UNKNOWN, retryable: false, retryAfterMs };
      }
      if (s === 429) {
        return { reason: RetryReason.RATE_LIMITED, retryable: true, retryAfterMs };
      }
      if (s >= 500 && s < 600) {
        return { reason: RetryReason.SERVER_ERROR, retryable: true, retryAfterMs };
      }
      if (retryable.includes(s)) {
        return { reason: RetryReason.UNKNOWN, retryable: true, retryAfterMs };
      }
      if (s >= 400 && s < 500) {
        return { reason: RetryReason.CLIENT_ERROR, retryable: false, retryAfterMs };
      }
      // 2xx/3xx reaching the failure path is a caller bug — don't retry.
      return { reason: RetryReason.UNKNOWN, retryable: false, retryAfterMs };
    }
    if (f.error !== undefined) {
      return { reason: RetryReason.TRANSPORT_ERROR, retryable: true, retryAfterMs };
    }
    return { reason: RetryReason.UNKNOWN, retryable: false, retryAfterMs };
  }
}

export class RetryEngine {
  private readonly _budget: RetryBudget | null;
  private readonly _backoff: AdaptiveBackoff;
  private readonly _classifier: FailureClassifier;
  private readonly _parser: RetryAfterParser;
  private readonly _clock: RetryEngineClock;
  private readonly _sleeper: Sleeper;
  private readonly _maxAttempts: number;
  private readonly _honorRetryAfter: boolean;
  private readonly _retryableStatuses: readonly number[];
  private readonly _nonRetryableStatuses: readonly number[];

  constructor(
    options: RetryEngineOptions = {},
    deps: {
      budget?: RetryBudget | null;
      backoff?: AdaptiveBackoff;
      classifier?: FailureClassifier;
      parser?: RetryAfterParser;
    } = {},
  ) {
    this._clock = options.clock ?? new ManualEngineClock();
    this._sleeper = options.sleeper ?? realSleep;
    this._maxAttempts = Math.max(1, options.maxAttempts ?? 3);
    this._honorRetryAfter = options.honorRetryAfter ?? true;
    this._retryableStatuses = options.retryableStatuses ?? [];
    this._nonRetryableStatuses = options.nonRetryableStatuses ?? [];
    this._budget = deps.budget ?? null;
    this._backoff = deps.backoff ?? new AdaptiveBackoff({ clock: this._clock });
    this._classifier = deps.classifier ?? new DefaultClassifier();
    this._parser = deps.parser ?? new RetryAfterParser(this._clock);
    void this._parser;
  }

  /**
   * Run `op` under the retry policy.
   *
   * @param scopeKey budget + backoff key (e.g. "payments-api:POST /charge")
   * @param idempotency 'idempotent' | 'non-idempotent' | 'unknown'
   * @param op produces `OperationResult`; throwing counts as transport error.
   */
  async run<T>(
    scopeKey: string,
    idempotency: Idempotency,
    op: RetryableOperation<T>,
  ): Promise<RetryOutcome<T>> {
    const attempts: AttemptRecord[] = [];
    let lastError: unknown = undefined;
    let lastReason = RetryReason.UNKNOWN;
    let budgetStopped = false;
    let nonIdempotentStopped = false;

    for (let attempt = 0; attempt < this._maxAttempts; attempt++) {
      const startedAt = this._clock.now();
      let result: OperationResult<T>;
      try {
        result = await op(attempt);
      } catch (err: unknown) {
        result = { ok: false, failure: { error: err } };
      }

      if (result.ok) {
        this._backoff.observeSuccess(scopeKey, Math.max(0, this._clock.now() - startedAt));
        return {
          ok: true,
          value: result.value,
          attempts,
          budgetStopped,
          nonIdempotentStopped,
        };
      }

      const classified = this._classifier.classify(
        result.failure,
        this._retryableStatuses,
        this._nonRetryableStatuses,
      );
      lastReason = classified.reason;
      lastError = result.failure.error ?? new Error(`HTTP ${result.failure.statusCode ?? '?'}`);

      // Decide whether to attempt again.
      const isLastAttempt = attempt + 1 >= this._maxAttempts;
      if (isLastAttempt) {
        attempts.push({ attempt, classified, delayMs: 0, budgetCost: 0 });
        break;
      }
      if (!classified.retryable) {
        attempts.push({ attempt, classified, delayMs: 0, budgetCost: 0 });
        break;
      }
      if (idempotency === 'non-idempotent') {
        attempts.push({ attempt, classified, delayMs: 0, budgetCost: 0 });
        nonIdempotentStopped = true;
        lastError = new NonIdempotentError();
        break;
      }

      // Budget check — a denied token ends retries with the original error.
      let budgetCost = 0;
      if (this._budget) {
        if (!this._budget.tryAcquire()) {
          attempts.push({ attempt, classified, delayMs: 0, budgetCost: 0 });
          budgetStopped = true;
          // Preserve the original error; annotate it via outcome flag.
          lastError = lastError ?? new RetryBudgetExhaustedError(this._budget.scope);
          break;
        }
        budgetCost = 1;
      }

      // Delay = max(server retry-after, adaptive backoff).
      const backoffMs = this._backoff.delayFor(scopeKey, attempt);
      const serverMs = this._honorRetryAfter ? classified.retryAfterMs ?? 0 : 0;
      const delayMs = Math.max(backoffMs, serverMs);
      attempts.push({ attempt, classified, delayMs, budgetCost });
      if (delayMs > 0) await this._sleeper(delayMs);
    }

    return {
      ok: false,
      attempts,
      finalError: lastError,
      finalReason: lastReason,
      budgetStopped,
      nonIdempotentStopped,
    };
  }

  /**
   * Convenience wrapper: run and either return the value or throw the
   * last failure (wrapped in `RetryExhaustedError` when attempts ran out).
   */
  async runOrThrow<T>(scopeKey: string, idempotency: Idempotency, op: RetryableOperation<T>): Promise<T> {
    const outcome = await this.run(scopeKey, idempotency, op);
    if (outcome.ok) return outcome.value as T;
    if (outcome.nonIdempotentStopped) throw outcome.finalError;
    if (outcome.budgetStopped) throw new RetryBudgetExhaustedError(scopeKey);
    if (outcome.finalError instanceof NonIdempotentError) throw outcome.finalError;
    const last = outcome.attempts[outcome.attempts.length - 1];
    throw new RetryExhaustedError(outcome.attempts.length, outcome.finalReason ?? RetryReason.UNKNOWN, last?.classified ? outcome.finalError : outcome.finalError);
  }
}
