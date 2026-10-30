/**
 * WriteModel Engine2 — Shared Types
 *
 * Second-generation write-model primitives: idempotent command
 * deduplication, pre-execution validation pipelines, cold-storage
 * aggregate archiving, write-behind batching, and conflict-resolution
 * strategies.
 *
 * @module WriteModelLayer/Engine2
 */

/** Injectable clock for dedup TTLs, archive aging, and buffer flush. */
export interface WmClock2 {
  now(): number;
}

export class SystemWmClock2 implements WmClock2 {
  now(): number {
    return Date.now();
  }
}

/** Test clock with manual time control. */
export class ManualWmClock2 implements WmClock2 {
  private _t: number;
  constructor(start: number = 0) {
    this._t = start;
  }
  now(): number {
    return this._t;
  }
  advance(ms: number): void {
    this._t += ms;
  }
  set(ms: number): void {
    this._t = ms;
  }
}

/** A write-model command envelope. */
export interface WmCommand {
  /** Unique command id. */
  readonly commandId: string;
  /** Idempotency key supplied by the caller (may equal commandId). */
  readonly idempotencyKey: string;
  /** Command type, e.g. "orders.create". */
  readonly type: string;
  /** Aggregate the command targets. */
  readonly aggregateId: string;
  /** Command payload. */
  readonly payload: Record<string, unknown>;
  /** Caller-declared expected aggregate version (optimistic concurrency). */
  readonly expectedVersion?: number;
  /** Issue timestamp. */
  readonly issuedAtMs: number;
}

/** Outcome of a command that passed dedup + validation. */
export interface CommandReceipt {
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly accepted: boolean;
  /** Events produced (event-sourced write side). */
  readonly eventsProduced: number;
  readonly reason?: string;
}
