/**
 * TransactionHooks — beforeCommit / afterCommit / afterRollback.
 *
 * Hook discipline that real UoW implementations get wrong:
 *  - beforeCommit hooks run inside the transaction — they may veto by
 *    throwing, which triggers rollback (and afterRollback hooks fire).
 *  - afterCommit hooks run after durability — a failure there cannot
 *    un-commit; failures are collected, not thrown.
 *  - afterRollback hooks run for BOTH explicit rollback and vetoed
 *    commits — cleanup listeners must not leak on the veto path.
 *
 * Registration order: hooks run in registration order per phase.
 * afterCommit/afterRollback failures are isolated — one bad listener
 * doesn't kill the rest.
 *
 * @module UnitOfWorkLayer/Engine2
 */

import { HookPhase } from './types';

export type HookFn = () => void | Promise<void>;

export interface HookOutcome {
  readonly phase: HookPhase;
  /** Hook that threw, by registration index. */
  readonly failures: Array<{ index: number; error: string }>;
}

export class TransactionHooks {
  private readonly _hooks: Record<HookPhase, HookFn[]> = {
    beforeCommit: [],
    afterCommit: [],
    afterRollback: [],
  };

  on(phase: HookPhase, fn: HookFn): this {
    this._hooks[phase].push(fn);
    return this;
  }

  /**
   * beforeCommit: run all; any throw → veto (caller rolls back).
   * Returns thrown errors in registration order, empty = proceed.
   */
  runBeforeCommit(): HookOutcome {
    const failures: Array<{ index: number; error: string }> = [];
    for (const [i, fn] of this._hooks.beforeCommit.entries()) {
      try {
        const r = fn();
        if (r instanceof Promise) {
          failures.push({ index: i, error: 'async hooks not supported in sync path' });
        }
      } catch (e) {
        failures.push({ index: i, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return { phase: 'beforeCommit', failures };
  }

  /**
   * afterCommit/afterRollback: run all, isolate failures (collected,
   * not thrown — a committed tx can't be un-committed by a hook).
   */
  private _runSettled(phase: 'afterCommit' | 'afterRollback'): HookOutcome {
    const failures: Array<{ index: number; error: string }> = [];
    for (const [i, fn] of this._hooks[phase].entries()) {
      try {
        const r = fn();
        if (r instanceof Promise) {
          failures.push({ index: i, error: 'async hooks not supported in sync path' });
        }
      } catch (e) {
        failures.push({ index: i, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return { phase, failures };
  }

  runAfterCommit(): HookOutcome {
    return this._runSettled('afterCommit');
  }

  runAfterRollback(): HookOutcome {
    return this._runSettled('afterRollback');
  }

  /**
   * Full commit ritual: beforeCommit → (veto → afterRollback) →
   * commit() → afterCommit. Returns the hook outcomes.
   */
  commitWithHooks(commit: () => void): { vetoed: boolean; outcomes: HookOutcome[] } {
    const outcomes: HookOutcome[] = [];
    const before = this.runBeforeCommit();
    outcomes.push(before);
    if (before.failures.length) {
      outcomes.push(this.runAfterRollback());
      return { vetoed: true, outcomes };
    }
    commit();
    outcomes.push(this.runAfterCommit());
    return { vetoed: false, outcomes };
  }

  /** Rollback ritual — always fires afterRollback. */
  rollbackWithHooks(): HookOutcome {
    return this.runAfterRollback();
  }
}
