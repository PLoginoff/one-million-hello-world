/**
 * IdempotencyRegistry — decides whether a *specific request* (not just
 * an operation type) may be retried.
 *
 * "Is this operation idempotent?" has two levels:
 *   1. The *method* is safe to retry (GET, PUT-with-key) — answered by
 *      the caller's `Idempotency` tag.
 *   2. This *specific invocation* hasn't already been accepted —
 *      answered by an idempotency key the client sends (Stripe-style
 *      `Idempotency-Key` header). Retrying a request that already
 *      succeeded is not only wasteful, it's wrong (double charge).
 *
 * This registry tracks idempotency keys seen:
 *   - `begin(key)` marks a key in-flight; a retry of an in-flight key
 *     is a *join* (wait for the first result) not a new execution;
 *   - `complete(key, result)` / `fail(key, err)` settle the record —
 *     retries of a completed key return the stored result;
 *   - records expire after `ttlMs` (dedup window — Stripe uses 24h);
 *   - a key seen with a *different* payload fingerprint is a
 *     `IdempotencyConflictError` — the classic misuse detection.
 *
 * Payload fingerprinting is by FNV-1a of a stable serialization the
 * caller provides — the registry doesn't guess what "same request" means.
 *
 * @module RetryLayer/Engine
 */

import { RetryEngineClock, SystemEngineClock } from './types';
import { fnv1a32 } from './types';

export class IdempotencyConflictError extends Error {
  readonly key: string;
  constructor(key: string) {
    super(`Idempotency key "${key}" replayed with a different payload`);
    this.name = 'IdempotencyConflictError';
    this.key = key;
  }
}

export class IdempotencyInFlightError extends Error {
  readonly key: string;
  constructor(key: string) {
    super(`Idempotency key "${key}" is in-flight; join its promise instead of re-executing`);
    this.name = 'IdempotencyInFlightError';
    this.key = key;
  }
}

type RecordState = 'in-flight' | 'succeeded' | 'failed';

interface IdemRecord<R = unknown> {
  key: string;
  fingerprint: number;
  state: RecordState;
  result?: R;
  error?: unknown;
  createdAt: number;
  expiresAt: number;
  /** Promise joiners await (in-flight only). */
  promise?: Promise<R>;
  resolve?: (v: R) => void;
  reject?: (e: unknown) => void;
}

export interface IdempotencyOptions {
  /** Dedup window (ms). Default 24h. */
  ttlMs?: number;
  clock?: RetryEngineClock;
}

export type IdemCheckResult<R> =
  | { kind: 'new'; record: IdemRecord<R> }
  | { kind: 'replay'; result: R }
  | { kind: 'in-flight'; promise: Promise<R> }
  | { kind: 'conflict' };

export class IdempotencyRegistry<R = unknown> {
  private readonly _clock: RetryEngineClock;
  private readonly _ttlMs: number;
  private readonly _records = new Map<string, IdemRecord<R>>();

  constructor(options: IdempotencyOptions = {}) {
    this._clock = options.clock ?? new SystemEngineClock();
    this._ttlMs = Math.max(0, options.ttlMs ?? 86_400_000);
  }

  /**
   * Check `key`+`payload` before executing. Returns what to do:
   * 'new' (execute + settle), 'replay' (return stored result),
   * 'in-flight' (await shared promise), 'conflict' (throw).
   */
  begin(key: string, payloadFingerprint: string | number): IdemCheckResult<R> {
    const fp = typeof payloadFingerprint === 'number' ? payloadFingerprint : fnv1a32(payloadFingerprint);
    const now = this._clock.now();
    this._sweepExpired(now);

    const rec = this._records.get(key);
    if (!rec) {
      const fresh: IdemRecord<R> = {
        key,
        fingerprint: fp,
        state: 'in-flight',
        createdAt: now,
        expiresAt: this._ttlMs > 0 ? now + this._ttlMs : 0,
      };
      fresh.promise = new Promise<R>((res, rej) => {
        fresh.resolve = res;
        fresh.reject = rej;
      });
      // Prevent unhandled rejection warnings when nobody joins.
      fresh.promise.catch(() => undefined);
      this._records.set(key, fresh);
      return { kind: 'new', record: fresh };
    }

    if (rec.fingerprint !== fp) return { kind: 'conflict' };
    switch (rec.state) {
      case 'in-flight':
        return { kind: 'in-flight', promise: rec.promise as Promise<R> };
      case 'succeeded':
        return { kind: 'replay', result: rec.result as R };
      case 'failed':
        // Retry of a failed execution is allowed to start a new record.
        this._records.delete(key);
        return this.begin(key, fp);
    }
  }

  /** Settle a 'new' record as succeeded — replays return this result. */
  complete(key: string, result: R): void {
    const rec = this._records.get(key);
    if (!rec || rec.state !== 'in-flight') return;
    rec.state = 'succeeded';
    rec.result = result;
    rec.resolve?.(result);
  }

  /** Settle a 'new' record as failed — replays see the error, next begin() retries. */
  fail(key: string, err: unknown): void {
    const rec = this._records.get(key);
    if (!rec || rec.state !== 'in-flight') return;
    rec.state = 'failed';
    rec.error = err;
    rec.reject?.(err);
  }

  /**
   * Run `op` under idempotency protection: dedup on `key`, join
   * in-flight executions, replay prior results.
   */
  async execute(key: string, payloadFingerprint: string | number, op: () => Promise<R> | R): Promise<R> {
    const check = this.begin(key, payloadFingerprint);
    switch (check.kind) {
      case 'conflict':
        throw new IdempotencyConflictError(key);
      case 'replay':
        return check.result;
      case 'in-flight':
        return check.promise;
      case 'new': {
        try {
          const r = await op();
          this.complete(key, r);
          return r;
        } catch (e: unknown) {
          this.fail(key, e);
          throw e;
        }
      }
    }
  }

  /** Drop expired records. Returns count removed. */
  private _sweepExpired(now: number): number {
    let n = 0;
    for (const [k, r] of this._records) {
      if (r.expiresAt > 0 && now >= r.expiresAt) {
        this._records.delete(k);
        n++;
      }
    }
    return n;
  }

  /** Explicit sweep for timer-driven cleanup. */
  sweep(): number {
    return this._sweepExpired(this._clock.now());
  }

  get size(): number {
    return this._records.size;
  }
}
