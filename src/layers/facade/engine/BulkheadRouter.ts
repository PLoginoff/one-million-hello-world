/**
 * BulkheadRouter — picks which subsystem instance to call based on
 * live capacity.
 *
 * Fan-out systems often have N equivalent backends (replicas, pools).
 * Routing to the least-loaded one beats round-robin: a stuck replica
 * shouldn't keep receiving work just because it's "its turn". The
 * router tracks in-flight counts per backend:
 *
 *   - `pick()` returns the backend with the lowest in-flight count
 *     that still has capacity (ties broken by least recently picked —
 *     spreads load across equal candidates);
 *   - `acquire()` combines pick+hold into a ticket the caller releases
 *     when work ends;
 *   - backends with `inFlight >= maxConcurrent` are skipped;
 *   - all saturated → returns null (caller decides: queue, shed, fail).
 *
 * This is the "least-connections" load-balancing pattern expressed as
 * a capacity-aware router inside the facade rather than an external LB.
 *
 * @module FacadeLayer/Engine
 */

import { FacadeEngineClock, SystemEngineClock } from './types';

export interface RoutedBackend {
  id: string;
  maxConcurrent: number;
}

interface BackendState {
  id: string;
  maxConcurrent: number;
  inFlight: number;
  lastPickedAt: number;
  totalAcquired: number;
}

export interface RouterTicket {
  readonly backendId: string;
  /** Idempotent release. */
  release(): void;
}

export class BulkheadRouter {
  private readonly _clock: FacadeEngineClock;
  private readonly _backends = new Map<string, BackendState>();
  private _lastPickTie = 0;

  constructor(backends: readonly RoutedBackend[], clock: FacadeEngineClock = new SystemEngineClock()) {
    this._clock = clock;
    for (const b of backends) {
      this._backends.set(b.id, {
        id: b.id,
        maxConcurrent: Math.max(1, b.maxConcurrent),
        inFlight: 0,
        lastPickedAt: 0,
        totalAcquired: 0,
      });
    }
  }

  addBackend(b: RoutedBackend): void {
    this._backends.set(b.id, {
      id: b.id,
      maxConcurrent: Math.max(1, b.maxConcurrent),
      inFlight: 0,
      lastPickedAt: 0,
      totalAcquired: 0,
    });
  }

  removeBackend(id: string): boolean {
    return this._backends.delete(id);
  }

  /**
   * Least-loaded backend with spare capacity; `null` when all are full.
   * Tie-break: least recently picked (round-robin within equal load).
   */
  pick(): string | null {
    let best: BackendState | null = null;
    for (const b of this._backends.values()) {
      if (b.inFlight >= b.maxConcurrent) continue;
      if (best === null) {
        best = b;
        continue;
      }
      if (b.inFlight < best.inFlight) {
        best = b;
      } else if (b.inFlight === best.inFlight && b.lastPickedAt < best.lastPickedAt) {
        best = b;
      }
    }
    return best?.id ?? null;
  }

  /**
   * Pick + hold a slot; caller must `release()` the ticket.
   * `null` when every backend is saturated.
   */
  acquire(): RouterTicket | null {
    const id = this.pick();
    if (id === null) return null;
    const b = this._backends.get(id)!;
    b.inFlight++;
    b.totalAcquired++;
    this._lastPickTie++;
    b.lastPickedAt = this._clock.now() + this._lastPickTie; // monotonic-ish ordering
    let live = true;
    const router = this;
    return {
      backendId: id,
      release(): void {
        if (!live) return;
        live = false;
        const bb = router._backends.get(id);
        if (bb && bb.inFlight > 0) bb.inFlight--;
      },
    };
  }

  /** Run `fn` on a picked backend; throws if none have capacity. */
  async run<T>(fn: (backendId: string) => Promise<T> | T): Promise<T> {
    const t = this.acquire();
    if (t === null) throw new Error('all backends saturated');
    try {
      return await fn(t.backendId);
    } finally {
      t.release();
    }
  }

  stats(): ReadonlyArray<{ id: string; inFlight: number; maxConcurrent: number; totalAcquired: number; utilization: number }> {
    return Array.from(this._backends.values()).map((b) => ({
      id: b.id,
      inFlight: b.inFlight,
      maxConcurrent: b.maxConcurrent,
      totalAcquired: b.totalAcquired,
      utilization: b.inFlight / b.maxConcurrent,
    }));
  }
}
