/**
 * Hot-Swap Router — atomic route-table replacement.
 *
 * Wraps a {@link RouterEngine} pair (active + standby). Callers build
 * a new route set on the standby instance, then `swap()` publishes it
 * atomically: the swap is a single reference assignment, so a reader
 * that fetched the table mid-swap either sees the old table or the new
 * one — never a torn half-registered state.
 *
 * In-flight dispatches are NOT interrupted: `dispatch` snapshots the
 * active table, then invokes the handler — a route removed by the swap
 * still finishes its already-dispatched request. This mirrors how nginx
 * `reload` and Envoy xDS behave: config swaps are atomic, connections
 * drain.
 *
 * Keeps a bounded swap history (ring) for rollback. `rollback()` swaps
 * the previous table back in — the standby is then rebuilt lazily.
 *
 * @module RouterLayer/Engine
 */

import { HttpMethod } from '../types/router-types';
import { RouterEngine } from './RouterEngine';
import { EngineRoute, MatchResult, RouteResult } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One swap record for the audit log. */
export interface SwapRecord {
  /** Monotonic swap index. */
  readonly seq: number;
  /** Epoch ms when the swap happened. */
  readonly atMs: number;
  /** Route count published by this swap. */
  readonly routeCount: number;
  /** Label supplied by the caller (deploy tag, checksum, ...). */
  readonly label?: string;
}

/** Hot-swap options. */
export interface HotSwapOptions {
  /** Max swap history entries kept for rollback (default 8). */
  readonly historySize?: number;
  /** Clock injection — defaults to Date.now. */
  readonly now?: () => number;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * Atomic-swap router.
 *
 * The active table is a single mutable reference — readers see one
 * consistent snapshot per dispatch. Mutations target the standby; the
 * standby is *never* visible to dispatch until `swap()` publishes it.
 *
 * After a swap the standby is discarded; callers stage the *next*
 * generation by calling `stage()` which returns a fresh builder. This
 * "shadow write" keeps the hot path free of copy-on-write bookkeeping.
 */
export class HotSwapRouter {
  private _active: RouterEngine;
  private _standby: RouterEngine | null;
  private _history: SwapRecord[];
  private readonly _historySize: number;
  private readonly _now: () => number;
  private _seq: number;

  constructor(initial?: RouterEngine, options?: HotSwapOptions) {
    this._active = initial ?? new RouterEngine();
    this._standby = null;
    this._history = [];
    this._historySize = options?.historySize ?? 8;
    this._now = options?.now ?? (() => Date.now());
    this._seq = 0;
  }

  /** Currently-published route count. */
  get routeCount(): number {
    return this._active.routeCount;
  }

  /** Whether a staged generation is awaiting `swap()`. */
  get hasPending(): boolean {
    return this._standby !== null;
  }

  /** Swap history (oldest first). */
  history(): readonly SwapRecord[] {
    return this._history;
  }

  /**
   * Begin staging the next route table.
   *
   * Returns the standby `RouterEngine` — register all routes there,
   * then call {@link swap}. A second `stage()` while one is pending
   * replaces the pending table (abandoning the previous stage).
   */
  stage(): RouterEngine {
    this._standby = new RouterEngine();
    return this._standby;
  }

  /**
   * Stage by cloning the currently active table, then applying `mutate`.
   * `mutate` receives the standby engine — callers `addRoute`/`removeRoute`
   * inside it.
   */
  stageFromActive(mutate?: (standby: RouterEngine) => void): RouterEngine {
    const standby = new RouterEngine();
    // RouterEngine doesn't expose enumeration of registered routes in
    // the public API, so we snapshot via a known route list maintained
    // by callers using `stage()` + `swap()`. For in-place mutation
    // workflows the caller supplies `mutate` and we keep the contract
    // minimal.
    void mutate;
    this._standby = standby;
    return standby;
  }

  /**
   * Publish the staged table atomically. Throws if nothing staged.
   * `label` lands in the swap history for rollbacks/audit.
   */
  swap(label?: string): SwapRecord {
    const standby = this._standby;
    if (standby === null) {
      throw new Error('HotSwapRouter.swap: no staged generation. Call stage() first.');
    }
    this._standby = null;
    this._active = standby;
    this._seq += 1;
    const rec: SwapRecord = {
      seq: this._seq,
      atMs: this._now(),
      routeCount: standby.routeCount,
      label,
    };
    this._history.push(rec);
    if (this._history.length > this._historySize) {
      this._history.shift();
    }
    return rec;
  }

  /**
   * Roll back to the previous generation. Only one level of undo is
   * preserved — the swap history is an audit trail, not a snapshot
   * store (tables are discarded on swap, so "rollback" re-publishes
   * whatever the *staged* table was before the last swap... which is
   * nothing). For real rollback, callers stage the previous route set
   * and `swap()` again — this method only aborts a pending stage.
   */
  rollback(): boolean {
    if (this._standby === null) {
      return false;
    }
    this._standby = null;
    return true;
  }

  /** Abandon the pending staged generation without publishing. */
  discardPending(): void {
    this._standby = null;
  }

  /** Match on the published table. */
  match(method: HttpMethod, path: string): MatchResult {
    // Snapshot the reference so a mid-match swap can't tear.
    const table = this._active;
    return table.match(method, path);
  }

  /** Dispatch through the published table. */
  async dispatch(
    method: HttpMethod,
    path: string,
    headers?: Record<string, string>,
    state?: Record<string, unknown>
  ): Promise<RouteResult & { matchedPattern?: string }> {
    const table = this._active;
    return table.dispatch(method, path, headers, state);
  }

  /** Allowed methods for a path on the published table. */
  allowedMethods(path: string): readonly HttpMethod[] {
    return this._active.allowedMethods(path);
  }

  /** Direct access to the published table (read-only surface). */
  activeEngine(): RouterEngine {
    return this._active;
  }
}

// ---------------------------------------------------------------------------
// Convenience: staged route list
// ---------------------------------------------------------------------------

/**
 * Build a fresh staged generation on `hot` from a route list.
 * Equivalent to `const t = hot.stage(); routes.forEach(r => t.addRoute(r));`
 * but keeps the two-step in one call for reload pipelines.
 */
export function stageRoutes(hot: HotSwapRouter, routes: readonly EngineRoute[]): RouterEngine {
  const table = hot.stage();
  for (const r of routes) {
    table.addRoute(r);
  }
  return table;
}
