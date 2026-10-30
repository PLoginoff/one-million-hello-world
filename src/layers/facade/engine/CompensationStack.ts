/**
 * CompensationStack — saga-style undo log for multi-step side effects.
 *
 * When an orchestrated call performs several mutating operations
 * (create order → reserve inventory → charge card), a mid-flow failure
 * must undo completed steps in reverse order. This is the *generic*
 * compensation primitive — `OrchestrationFacade` handles per-step
 * compensation inline; the stack covers code paths that aren't
 * structured as a `Step[]` pipeline (imperative business logic pushing
 * compensations as it goes):
 *
 *   stack.push('reserve', () => inventory.release(rid))
 *   stack.push('charge', () => payments.refund(cid))
 *   ... later failure ...
 *   await stack.unwind()   // refunds, then releases
 *
 * Semantics:
 *   - `unwind` runs compensations LIFO; errors are collected, not
 *     thrown — unwind always finishes (a stuck rollback is worse than
 *     a logged partial one);
 *   - `commit` drops the stack (work succeeded — compensations never
 *     run);
 *   - `pop` removes the latest compensation without running it
 *     ("the step was itself undone by its caller");
 *   - idempotent unwind: second call is a no-op.
 *
 * @module FacadeLayer/Engine
 */

import { FacadeEngineClock, SystemEngineClock } from './types';

export type Compensation = () => Promise<void> | void;

export interface UnwindResult {
  ran: number;
  failed: Array<{ name: string; error: unknown }>;
  /** Names of compensations that ran successfully (LIFO order). */
  compensated: string[];
  durationMs: number;
}

interface StackEntry {
  name: string;
  compensate: Compensation;
  pushedAt: number;
}

export class CompensationStack {
  private readonly _clock: FacadeEngineClock;
  private _stack: StackEntry[] = [];
  private _unwound = false;

  constructor(clock: FacadeEngineClock = new SystemEngineClock()) {
    this._clock = clock;
  }

  /** Register a compensation for the step just performed. */
  push(name: string, compensate: Compensation): void {
    if (this._unwound) throw new Error('cannot push after unwind');
    this._stack.push({ name, compensate, pushedAt: this._clock.now() });
  }

  /** Remove the most recent compensation (already undone elsewhere). */
  pop(): boolean {
    return this._stack.pop() !== undefined;
  }

  /** Drop all compensations — the guarded work completed. */
  commit(): void {
    this._stack = [];
    this._unwound = true;
  }

  /**
   * Run all compensations LIFO. Never throws — failures are collected.
   * Idempotent: a second call returns immediately with empty results.
   */
  async unwind(): Promise<UnwindResult> {
    if (this._unwound) {
      return { ran: 0, failed: [], compensated: [], durationMs: 0 };
    }
    this._unwound = true;
    const started = this._clock.now();
    const compensated: string[] = [];
    const failed: Array<{ name: string; error: unknown }> = [];
    while (this._stack.length > 0) {
      const e = this._stack.pop()!;
      try {
        await e.compensate();
        compensated.push(e.name);
      } catch (err: unknown) {
        failed.push({ name: e.name, error: err });
      }
    }
    return {
      ran: compensated.length + failed.length,
      failed,
      compensated,
      durationMs: this._clock.now() - started,
    };
  }

  get depth(): number {
    return this._stack.length;
  }

  /** Pending compensation names (oldest→newest). */
  pending(): string[] {
    return this._stack.map((e) => e.name);
  }
}
