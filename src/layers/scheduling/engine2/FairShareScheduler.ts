/**
 * Scheduling Engine2 — Fair-Share Queue
 *
 * PreemptiveQueue orders by absolute priority — right for hard
 * deadlines, wrong for multi-tenant fairness (tenant A with 100 jobs
 * starves tenant B with 2). Fair-share scheduling allocates slots by
 * PROPORTION, not rank: each tenant holds a `share`, and the tenant
 * whose recent usage is furthest below its entitlement dispatches next.
 *
 * Algorithm: deficit round-robin per tenant.
 *   - Every tenant has `allocated` = share / Σshares of ACTIVE tenants.
 *   - `used[t]` counts dispatches in the current window; the tenant with
 *     the lowest `used/allocated` ratio runs next (max-min fairness).
 *   - Inactive tenants don't consume entitlement — a tenant with zero
 *     queued jobs yields its share to the others (work-conserving).
 *   - `endWindow()` resets `used` — prevents a tenant that ran nothing
 *     all night from front-running the whole morning queue.
 *
 * Within a tenant, jobs are FIFO (per-tenant priority is a separate
 * concern — compose with PreemptiveQueue if both are needed).
 *
 * Complexity: enqueue/dequeue O(tenants); state O(tenants + queued).
 *
 * @module SchedulingLayer/Engine2
 */

import { Clock, SystemClock } from '../scheduler/SchedulerTypes';

export interface TenantJob {
  readonly jobId: string;
  readonly tenant: string;
  readonly payload?: unknown;
}

export interface FairShareOptions {
  readonly clock?: Clock;
  /** Window length for `used` accounting; 0 = never reset (default 60s). */
  readonly windowMs?: number;
}

interface TenantState {
  share: number;
  used: number;
  readonly queue: TenantJob[];
}

const DEFAULT_WINDOW = 60_000;

export class FairShareScheduler {
  private readonly _clock: Clock;
  private readonly _windowMs: number;
  private readonly _tenants = new Map<string, TenantState>();
  private _windowStart: number;

  constructor(options?: FairShareOptions) {
    this._clock = options?.clock ?? new SystemClock();
    this._windowMs = options?.windowMs ?? DEFAULT_WINDOW;
    this._windowStart = this._clock.now();
  }

  /** Register or update a tenant's share weight. */
  setShare(tenant: string, share: number): void {
    if (share <= 0) throw new Error('share must be > 0');
    let t = this._tenants.get(tenant);
    if (!t) {
      t = { share, used: 0, queue: [] };
      this._tenants.set(tenant, t);
    } else {
      t.share = share;
    }
  }

  enqueue(job: TenantJob): void {
    let t = this._tenants.get(job.tenant);
    if (!t) {
      // Unregistered tenants get share 1 — no implicit starvation.
      t = { share: 1, used: 0, queue: [] };
      this._tenants.set(job.tenant, t);
    }
    t.queue.push(job);
  }

  /** Usage ratio: used / entitled share. Lowest dispatches next. */
  private _ratio(t: TenantState, totalShares: number): number {
    const entitled = t.share / totalShares;
    return entitled === 0 ? Infinity : t.used / entitled;
  }

  /**
   * Pop the next job by deficit round-robin. Only tenants WITH queued
   * work compete — the allocation is recomputed over the active set.
   */
  dispatch(): TenantJob | null {
    this._maybeResetWindow();
    const active = [...this._tenants.entries()].filter(([, t]) => t.queue.length > 0);
    if (active.length === 0) return null;
    const totalShares = active.reduce((a, [, t]) => a + t.share, 0);
    let winner: TenantState | null = null;
    let best = Infinity;
    let bestUsed = Infinity;
    for (const [, t] of active) {
      const r = this._ratio(t, totalShares);
      // Tie-break on absolute `used`: equal deficit ratios would otherwise
      // always pick the first-inserted tenant and starve the rest.
      if (r < best || (r === best && t.used < bestUsed)) {
        best = r;
        bestUsed = t.used;
        winner = t;
      }
    }
    const job = winner!.queue.shift()!;
    winner!.used++;
    return job;
  }

  private _maybeResetWindow(): void {
    if (this._windowMs <= 0) return;
    const now = this._clock.now();
    if (now - this._windowStart >= this._windowMs) {
      this._windowStart = now;
      for (const t of this._tenants.values()) t.used = 0;
    }
  }

  /** Peek at the dispatch order without consuming — preview for tests/UI. */
  order(limit: number): readonly TenantJob[] {
    const out: TenantJob[] = [];
    // Copy state: simulate without mutating.
    const sim = new Map<string, { share: number; used: number; queue: TenantJob[] }>();
    for (const [k, t] of this._tenants) {
      sim.set(k, { share: t.share, used: t.used, queue: [...t.queue] });
    }
    for (let i = 0; i < limit; i++) {
      const active = [...sim.entries()].filter(([, t]) => t.queue.length > 0);
      if (active.length === 0) break;
      const total = active.reduce((a, [, t]) => a + t.share, 0);
      let winner: (typeof active)[number][1] | null = null;
      let best = Infinity;
      let bestUsed = Infinity;
      for (const [, t] of active) {
        const entitled = t.share / total;
        const r = entitled === 0 ? Infinity : t.used / entitled;
        if (r < best || (r === best && t.used < bestUsed)) {
          best = r;
          bestUsed = t.used;
          winner = t;
        }
      }
      const job = winner!.queue.shift()!;
      winner!.used++;
      out.push(job);
    }
    return out;
  }

  queued(tenant?: string): number {
    if (tenant === undefined) {
      return [...this._tenants.values()].reduce((a, t) => a + t.queue.length, 0);
    }
    return this._tenants.get(tenant)?.queue.length ?? 0;
  }

  /** Current entitlement share for diagnostics (over ACTIVE tenants). */
  entitlement(tenant: string): number {
    const t = this._tenants.get(tenant);
    if (!t || t.queue.length === 0) return 0;
    const active = [...this._tenants.values()].filter((x) => x.queue.length > 0);
    const total = active.reduce((a, x) => a + x.share, 0);
    return total === 0 ? 0 : t.share / total;
  }
}
