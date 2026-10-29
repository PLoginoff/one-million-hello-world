/**
 * RoundRobinStrategy
 *
 * Classic round-robin: iterate the candidate list, handing each request to the
 * next backend. Maintains a monotonically increasing cursor; because the pool
 * may shrink between calls (removals are not forced to wait for a full cycle),
 * the cursor is stored modulo the current pool size at selection time.
 *
 * Properties:
 *  - O(1) selection.
 *  - Fair over repeated calls when the membership is stable: for a pool of N
 *    backends, every backend receives ⌈k/N⌉ of any k consecutive requests
 *    (±1 due to removals).
 *  - Order is *pool insertion order*, not sorted; that matches the semantics
 *    of nginx's default `upstream` behavior.
 *
 * @module LoadBalancerLayer/Strategies
 */

import {
  BackendPoolEntry,
  BackendSelection,
  BalanceRequest,
  IBalancingStrategy,
} from '../types/backend';

export class RoundRobinStrategy implements IBalancingStrategy {
  readonly name = 'round-robin';

  private _cursor: number;
  private _selectionCount: number;

  constructor() {
    this._cursor = 0;
    this._selectionCount = 0;
  }

  /**
   * Select the next backend in cyclic order.
   *
   * @param backends eligible pool entries (insertion-ordered)
   * @param request  routing context (unused — RR is request-agnostic)
   */
  select(backends: readonly BackendPoolEntry[], _request: BalanceRequest): BackendSelection | undefined {
    if (backends.length === 0) {
      return undefined;
    }

    const index = this._cursor % backends.length;
    const entry = backends[index];
    this._cursor = (this._cursor + 1) % backends.length;
    this._selectionCount += 1;

    return {
      backend: entry.backend,
      strategy: this.name,
      selectedAt: Date.now(),
      diagnostics: {
        cursorIndex: index,
        poolSize: backends.length,
        selectionNumber: this._selectionCount,
      },
    };
  }

  /**
   * When a backend is added, the modulo cursor keeps working — new members
   * naturally join the rotation at their insertion position.
   */
  onBackendAdded(_entry: BackendPoolEntry): void {
    // Intentionally empty; cursor is relative to current pool size.
  }

  /**
   * Removing a backend while the cursor pointed past the end is handled by
   * the modulo on the next select() — nothing to repair eagerly.
   */
  onBackendRemoved(_entry: BackendPoolEntry): void {
    // Intentionally empty; cursor is relative to current pool size.
  }

  /** Reset the rotation cursor (useful for deterministic tests). */
  reset(): void {
    this._cursor = 0;
    this._selectionCount = 0;
  }

  /** Total number of selections made since construction or last reset. */
  get selectionCount(): number {
    return this._selectionCount;
  }
}
