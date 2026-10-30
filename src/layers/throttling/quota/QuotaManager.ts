/**
 * QuotaManager — long-horizon usage budgets (daily/monthly) with
 * rollover and X-RateLimit-* header computation.
 *
 * Rate limits and quotas solve different problems: a token bucket shapes
 * bursts over seconds; a quota caps total consumption over hours/days/
 * months ("1000 requests/day", "50 GB transfer/month"). Quotas are what
 * API tiers bill on.
 *
 * Design:
 *
 *  - **Windows** are calendar-aligned periods. `daily` resets at UTC
 *    midnight; `monthly` at the 1st 00:00 UTC; a custom `windowMs` is an
 *    epoch-anchored tumbling window (`floor(now/windowMs)`).
 *  - **Rollover**: unused units may carry into the next period, capped
 *    at `maxRollover` — a "use it or bank some of it" policy. The carried
 *    amount is computed lazily on the first `consume`/`peek` after a
 *    boundary, so dormant identifiers cost nothing between periods.
 *  - **Multi-quota**: an identifier can hold several quota defs
 *    simultaneously (e.g. daily-requests + monthly-transfer). `consume`
 *    checks all quotas the identifier was configured with and reports
 *    the *most restrictive* outcome.
 *  - **Headers**: `quotaHeaders` produces the de-facto standard fields:
 *
 *      X-RateLimit-Limit      configured units per period
 *      X-RateLimit-Remaining  units left this period
 *      X-RateLimit-Reset      epoch seconds of the next period boundary
 *      X-RateLimit-Used       units consumed this period
 *      Retry-After            (only when rejected) seconds until reset
 *
 *  - All state is in-memory; the {@link QuotaSnapshot} export/import pair
 *    lets a caller persist periodically and restore after restart.
 *
 * Complexity: consume/peek are O(#quotas for the identifier); memory is
 * O(#identifiers × #quotas).
 *
 * @module Throttling/Quota
 */

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/** Quota period kinds. */
export enum QuotaPeriod {
  DAILY = 'daily',
  MONTHLY = 'monthly',
  /** Fixed tumbling window (e.g. hourly = 3_600_000). */
  CUSTOM = 'custom',
}

export interface QuotaDefinition {
  /** Human label — appears in headers/ledger keys. */
  readonly name: string;
  /** Units granted per period. */
  readonly limit: number;
  readonly period: QuotaPeriod;
  /** For CUSTOM: window length in ms. Ignored for DAILY/MONTHLY. */
  readonly windowMs?: number;
  /**
   * Units allowed to roll into the next period from unconsumed balance.
   * 0 (default) = use-it-or-lose-it.
   */
  readonly maxRollover?: number;
  /** What one request costs when callers don't specify. Default 1. */
  readonly defaultCost?: number;
}

/** Internal per-identifier, per-quota ledger (exported for snapshots). */
export interface QuotaLedger {
  /** Period key identifying the current window (see `_periodKey`). */
  periodKey: string;
  /** Units consumed inside `periodKey`. */
  used: number;
  /** Units carried in from the previous period. */
  carried: number;
  /** Absolute period end (epoch ms) for Reset headers. */
  periodEnd: number;
}

/** Outcome of a consume attempt. */
export interface QuotaConsumeResult {
  readonly allowed: boolean;
  /** Per-quota post-check balances. */
  readonly quotas: ReadonlyMap<string, QuotaBalance>;
  /** The binding quota name when rejected (most constrained). */
  readonly binding: string | null;
}

/** Balance view for one quota. */
export interface QuotaBalance {
  readonly name: string;
  readonly limit: number;
  readonly used: number;
  /** Units still available: limit + carried − used. */
  readonly remaining: number;
  /** Epoch ms the current period ends. */
  readonly resetTime: number;
  readonly carried: number;
}

/** X-RateLimit-* style headers. */
export interface QuotaHeaders {
  readonly 'X-RateLimit-Limit': number;
  readonly 'X-RateLimit-Remaining': number;
  readonly 'X-RateLimit-Reset': number;
  readonly 'X-RateLimit-Used': number;
  readonly 'Retry-After'?: number;
}

/** Serializable form for persistence. */
export interface QuotaSnapshot {
  readonly version: 1;
  readonly ledgers: ReadonlyArray<{
    readonly identifier: string;
    readonly quota: string;
    readonly ledger: QuotaLedger;
  }>;
}

export interface QuotaManagerOptions {
  readonly now?: () => number;
}

export class QuotaManager {
  private readonly _now: () => number;
  /** identifier → quota name → definition (per-identifier config). */
  private readonly _defs = new Map<string, Map<string, QuotaDefinition>>();
  /** identifier → quota name → ledger. */
  private readonly _ledgers = new Map<string, Map<string, QuotaLedger>>();

  constructor(options: QuotaManagerOptions = {}) {
    this._now = options.now ?? (() => Date.now());
  }

  /** Configure (or replace) the quota set for an identifier. */
  configure(identifier: string, quotas: readonly QuotaDefinition[]): void {
    const defs = new Map<string, QuotaDefinition>();
    for (const q of quotas) {
      if (q.limit <= 0) throw new Error(`quota ${q.name}: limit must be > 0`);
      if (q.period === QuotaPeriod.CUSTOM && (q.windowMs === undefined || q.windowMs <= 0)) {
        throw new Error(`quota ${q.name}: CUSTOM period requires windowMs > 0`);
      }
      defs.set(q.name, q);
    }
    this._defs.set(identifier, defs);
  }

  /** Names of quotas configured for the identifier. */
  quotasFor(identifier: string): string[] {
    return [...(this._defs.get(identifier)?.keys() ?? [])];
  }

  /**
   * Attempt to consume `cost` units against every configured quota.
   * The request is admitted only when *all* quotas have capacity; on
   * rejection no quota is charged (the check is atomic — we validate
   * first, then debit).
   */
  consume(identifier: string, cost?: number): QuotaConsumeResult {
    const defs = this._defs.get(identifier);
    if (defs === undefined || defs.size === 0) {
      return { allowed: true, quotas: new Map(), binding: null };
    }
    const balances = new Map<string, QuotaBalance>();
    let binding: string | null = null;
    let bindingRemaining = Number.POSITIVE_INFINITY;

    // Phase 1: compute balances — no mutation yet.
    const planned = new Map<string, { def: QuotaDefinition; ledger: QuotaLedger; cost: number }>();
    for (const [name, def] of defs) {
      const ledger = this._ledgerFor(identifier, name, def);
      const c = cost ?? def.defaultCost ?? 1;
      const remaining = def.limit + ledger.carried - ledger.used;
      balances.set(name, {
        name,
        limit: def.limit,
        used: ledger.used,
        remaining,
        resetTime: ledger.periodEnd,
        carried: ledger.carried,
      });
      if (remaining < bindingRemaining) {
        bindingRemaining = remaining;
        binding = name;
      }
      planned.set(name, { def, ledger, cost: c });
    }

    // Phase 2: every quota must cover the cost.
    for (const [name, p] of planned) {
      const remaining = p.def.limit + p.ledger.carried - p.ledger.used;
      if (remaining < p.cost) {
        return { allowed: false, quotas: balances, binding: name };
      }
    }
    // Phase 3: debit everyone.
    const finalBalances = new Map<string, QuotaBalance>();
    for (const [name, p] of planned) {
      p.ledger.used += p.cost;
      finalBalances.set(name, {
        name,
        limit: p.def.limit,
        used: p.ledger.used,
        remaining: p.def.limit + p.ledger.carried - p.ledger.used,
        resetTime: p.ledger.periodEnd,
        carried: p.ledger.carried,
      });
    }
    return { allowed: true, quotas: finalBalances, binding: null };
  }

  /**
   * Read balances without consuming — forces rollover if a boundary
   * passed since the last touch.
   */
  peek(identifier: string): ReadonlyMap<string, QuotaBalance> {
    const defs = this._defs.get(identifier);
    const out = new Map<string, QuotaBalance>();
    if (defs === undefined) return out;
    for (const [name, def] of defs) {
      const ledger = this._ledgerFor(identifier, name, def);
      out.set(name, {
        name,
        limit: def.limit,
        used: ledger.used,
        remaining: def.limit + ledger.carried - ledger.used,
        resetTime: ledger.periodEnd,
        carried: ledger.carried,
      });
    }
    return out;
  }

  /**
   * X-RateLimit-* headers from the identifier's *binding* quota
   * (lowest remaining) — the same shape API gateways emit.
   */
  quotaHeaders(identifier: string, rejected = false): QuotaHeaders | null {
    const balances = this.peek(identifier);
    if (balances.size === 0) return null;
    let binding: QuotaBalance | null = null;
    for (const b of balances.values()) {
      if (binding === null || b.remaining < binding.remaining) binding = b;
    }
    if (binding === null) return null;
    const headers: { -readonly [K in keyof QuotaHeaders]: QuotaHeaders[K] } = {
      'X-RateLimit-Limit': binding.limit,
      'X-RateLimit-Remaining': Math.max(0, binding.remaining),
      'X-RateLimit-Reset': Math.ceil(binding.resetTime / 1000),
      'X-RateLimit-Used': binding.used,
    };
    if (rejected) {
      headers['Retry-After'] = Math.max(0, Math.ceil((binding.resetTime - this._now()) / 1000));
    }
    return headers;
  }

  /** Grant bonus units — increases carried, effectively raising this period's headroom. */
  grant(identifier: string, quotaName: string, units: number): boolean {
    const def = this._defs.get(identifier)?.get(quotaName);
    if (def === undefined) return false;
    const ledger = this._ledgerFor(identifier, quotaName, def);
    ledger.carried += units;
    return true;
  }

  /** Serialize all ledgers (for persistence across restarts). */
  snapshot(): QuotaSnapshot {
    const ledgers: QuotaSnapshot['ledgers'][number][] = [];
    for (const [identifier, byQuota] of this._ledgers) {
      for (const [quota, ledger] of byQuota) {
        ledgers.push({ identifier, quota, ledger: { ...ledger } });
      }
    }
    return { version: 1, ledgers };
  }

  /** Restore a snapshot — merges into current state, latest wins. */
  restore(snap: QuotaSnapshot): void {
    if (snap.version !== 1) throw new Error(`unsupported snapshot version ${snap.version}`);
    for (const e of snap.ledgers) {
      let byQuota = this._ledgers.get(e.identifier);
      if (byQuota === undefined) {
        byQuota = new Map();
        this._ledgers.set(e.identifier, byQuota);
      }
      byQuota.set(e.quota, { ...e.ledger });
    }
  }

  /** Drop all state for an identifier (offboarding). */
  clear(identifier: string): void {
    this._defs.delete(identifier);
    this._ledgers.delete(identifier);
  }

  // ------------------------------------------------------------------
  // Period math
  // ------------------------------------------------------------------

  /**
   * Get the ledger for identifier+quota, rolling over if the stored
   * period is stale. Rollover: carried = min(maxRollover, remaining),
   * computed from the *last* stored period (multi-period gaps carry
   * only the immediately-preceding remainder — you can't bank a year
   * of unused quota).
   */
  private _ledgerFor(identifier: string, quotaName: string, def: QuotaDefinition): QuotaLedger {
    let byQuota = this._ledgers.get(identifier);
    if (byQuota === undefined) {
      byQuota = new Map();
      this._ledgers.set(identifier, byQuota);
    }
    const key = this._periodKey(def, this._now());
    const end = this._periodEnd(def, this._now());
    let ledger = byQuota.get(quotaName);
    if (ledger === undefined) {
      ledger = { periodKey: key, used: 0, carried: 0, periodEnd: end };
      byQuota.set(quotaName, ledger);
      return ledger;
    }
    if (ledger.periodKey !== key) {
      // Boundary crossed — roll over.
      const leftover = Math.max(0, def.limit + ledger.carried - ledger.used);
      ledger.carried = Math.min(def.maxRollover ?? 0, leftover);
      ledger.used = 0;
      ledger.periodKey = key;
      ledger.periodEnd = end;
    }
    return ledger;
  }

  /**
   * Stable period identifier. DAILY/MONTHLY use UTC calendar keys;
   * CUSTOM uses `floor(now/windowMs)` — the window index.
   */
  private _periodKey(def: QuotaDefinition, now: number): string {
    switch (def.period) {
      case QuotaPeriod.DAILY: {
        const d = new Date(now);
        return `D:${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
      }
      case QuotaPeriod.MONTHLY: {
        const d = new Date(now);
        return `M:${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
      }
      case QuotaPeriod.CUSTOM:
        return `C:${Math.floor(now / (def.windowMs as number))}`;
    }
  }

  /** Epoch ms when the current period ends. */
  private _periodEnd(def: QuotaDefinition, now: number): number {
    switch (def.period) {
      case QuotaPeriod.DAILY: {
        const d = new Date(now);
        const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
        return next;
      }
      case QuotaPeriod.MONTHLY: {
        const d = new Date(now);
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
      }
      case QuotaPeriod.CUSTOM:
        return (Math.floor(now / (def.windowMs as number)) + 1) * (def.windowMs as number);
    }
  }
}
