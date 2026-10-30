/**
 * Unit Economics Engine
 *
 * Cloud bills are meaningless at the aggregate level — what matters is
 * the marginal cost of the *thing the business sells*: a request, an
 * active user, a gigabyte stored, an order placed. This engine divides
 * attributed cost by business-dimension counters to produce the unit
 * cost metrics FinOps teams track:
 *
 *   costPerRequest = attributedCostCents / requestCount
 *   costPerUser    = attributedCostCents / activeUsers
 *   costPerGB      = attributedCostCents / gigabytesStored
 *
 * Beyond the point-in-time ratios, the engine tracks unit-cost trends:
 * a rising cost-per-request while total spend is flat means efficiency
 * is silently degrading (fewer requests, same infra) — the signal real
 * FinOps teams watch before it shows up in the CFO's dashboard.
 *
 * It also computes a marginal-vs-average split: average cost includes
 * sunk fixed costs; the marginal estimate (cost of the *next* unit)
 * uses the variable share — the economics distinction that decides
 * whether growth is profitable.
 *
 * Complexity: O(#records) for ingestion, O(1) per ratio query.
 *
 * @module CostOptimization/Engine2
 */

import { IClock, SystemClock, DAY_MS } from '../engines/types';

/** The business dimension a unit-cost metric is measured against. */
export enum UnitDimension {
  REQUEST = 'request',
  ACTIVE_USER = 'active-user',
  GB_STORED = 'gb-stored',
  ORDER = 'order',
  SEAT = 'seat',
}

/** A single observation pairing cost with a business counter. */
export interface UnitObservation {
  readonly timestamp: number;
  /** Which cost-center / team the spend belongs to. */
  readonly scope: string;
  /** Attributed spend for the period, in cents. */
  readonly costCents: number;
  /** The business counter for the same period (requests served, DAU, …). */
  readonly volume: number;
}

/** A computed unit-cost ratio at a point in time. */
export interface UnitCost {
  readonly scope: string;
  readonly dimension: UnitDimension;
  readonly windowMs: number;
  readonly costCents: number;
  readonly volume: number;
  /** costCents / volume — in cents per unit. */
  readonly centsPerUnit: number;
  /** Volume-weighted marginal cost estimate (see marginalCost). */
  readonly marginalCentsPerUnit: number;
}

/** Trend over consecutive windows. */
export interface UnitCostTrend {
  readonly scope: string;
  readonly dimension: UnitDimension;
  /** Points in chronological order. */
  readonly points: readonly { readonly windowStart: number; readonly centsPerUnit: number }[];
  /** Slope of centsPerUnit over time (cents/unit/day). */
  readonly slopePerDay: number;
  /** True when unit cost is growing faster than `alertSlope`. */
  readonly deteriorating: boolean;
}

/** Fixed-vs-variable cost split for marginal costing. */
export interface CostStructure {
  /** Share of spend that varies with volume (0..1). Default heuristic 0.6. */
  readonly variableFraction: number;
}

export class UnitEconomicsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnitEconomicsError';
  }
}

/**
 * UnitEconomics — cost-per-business-metric tracking.
 *
 * Observations are stored per (scope, dimension); windows aggregate
 * chronologically.
 */
export class UnitEconomics {
  private readonly _obs = new Map<string, UnitObservation[]>();
  private readonly _clock: IClock;

  constructor(clock: IClock = new SystemClock()) {
    this._clock = clock;
  }

  private _key(scope: string, dimension: UnitDimension): string {
    return `${scope}:${dimension}`;
  }

  /**
   * Record an observation. Observations may arrive out of order;
   * aggregation windows sort them.
   */
  record(dimension: UnitDimension, obs: UnitObservation): void {
    if (obs.costCents < 0) {
      throw new UnitEconomicsError(`negative cost for ${obs.scope}`);
    }
    if (obs.volume < 0) {
      throw new UnitEconomicsError(`negative volume for ${obs.scope}`);
    }
    const k = this._key(obs.scope, dimension);
    let arr = this._obs.get(k);
    if (arr === undefined) {
      arr = [];
      this._obs.set(k, arr);
    }
    arr.push({ ...obs });
  }

  /** All scopes currently tracked for a dimension. */
  scopes(dimension: UnitDimension): string[] {
    const out: string[] = [];
    for (const k of this._obs.keys()) {
      const [scope, dim] = k.split(':');
      if (dim === dimension) out.push(scope);
    }
    return out;
  }

  /**
   * Compute the unit cost for a scope over the trailing `windowMs`.
   * `costStructure` supplies the variable share for marginal costing:
   *
   *   marginal = avg × (1 + variableFraction × elasticityEstimate)
   *
   * Simplified: marginal ≈ variableFraction × avg when demand grows —
   * the fixed share is amortised away at the margin.
   */
  unitCost(
    scope: string,
    dimension: UnitDimension,
    windowMs: number,
    costStructure: CostStructure = { variableFraction: 0.6 }
  ): UnitCost | null {
    const arr = this._obs.get(this._key(scope, dimension));
    if (arr === undefined || arr.length === 0) return null;
    const cutoff = this._clock.now() - windowMs;
    const inWindow = arr.filter((o) => o.timestamp >= cutoff);
    if (inWindow.length === 0) return null;
    const cost = inWindow.reduce((a, o) => a + o.costCents, 0);
    const volume = inWindow.reduce((a, o) => a + o.volume, 0);
    if (volume === 0) {
      return {
        scope,
        dimension,
        windowMs,
        costCents: cost,
        volume: 0,
        centsPerUnit: Number.POSITIVE_INFINITY,
        marginalCentsPerUnit: Number.POSITIVE_INFINITY,
      };
    }
    const avg = cost / volume;
    // Marginal estimate: only the variable share scales with the next
    // unit of volume — fixed cost is already sunk.
    const marginal = avg * costStructure.variableFraction;
    return {
      scope,
      dimension,
      windowMs,
      costCents: cost,
      volume,
      centsPerUnit: avg,
      marginalCentsPerUnit: marginal,
    };
  }

  /**
   * Split the window into `buckets` sub-windows and compute the trend
   * of centsPerUnit across them. The slope is an OLS fit of the bucket
   * ratios on bucket start times — the cleanest "is efficiency
   * improving?" signal.
   */
  trend(
    scope: string,
    dimension: UnitDimension,
    windowMs: number,
    buckets: number,
    alertSlope = 0
  ): UnitCostTrend | null {
    const arr = this._obs.get(this._key(scope, dimension));
    if (arr === undefined || arr.length === 0 || buckets < 2) return null;
    const now = this._clock.now();
    const bucketMs = windowMs / buckets;
    const points: { windowStart: number; centsPerUnit: number }[] = [];
    for (let b = 0; b < buckets; b++) {
      const start = now - windowMs + b * bucketMs;
      const end = start + bucketMs;
      const inB = arr.filter((o) => o.timestamp >= start && o.timestamp < end);
      if (inB.length === 0) continue;
      const cost = inB.reduce((a, o) => a + o.costCents, 0);
      const volume = inB.reduce((a, o) => a + o.volume, 0);
      points.push({ windowStart: start, centsPerUnit: volume > 0 ? cost / volume : 0 });
    }
    if (points.length < 2) return null;
    // OLS slope on (day, centsPerUnit).
    const xs = points.map((p) => p.windowStart / DAY_MS);
    const ys = points.map((p) => p.centsPerUnit);
    const n = points.length;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let sxy = 0;
    for (let i = 0; i < n; i++) {
      sx += xs[i];
      sy += ys[i];
      sxx += xs[i] * xs[i];
      sxy += xs[i] * ys[i];
    }
    const denom = n * sxx - sx * sx;
    const slope = denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
    return {
      scope,
      dimension,
      points,
      slopePerDay: slope,
      deteriorating: slope > alertSlope,
    };
  }

  /**
   * Compare unit costs across scopes — the "who's most efficient" table
   * for dashboards. Sorted by centsPerUnit ascending (best first).
   */
  compareScopes(dimension: UnitDimension, windowMs: number): UnitCost[] {
    const out: UnitCost[] = [];
    for (const scope of this.scopes(dimension)) {
      const c = this.unitCost(scope, dimension, windowMs);
      if (c !== null && Number.isFinite(c.centsPerUnit)) out.push(c);
    }
    return out.sort((a, b) => a.centsPerUnit - b.centsPerUnit);
  }

  /**
   * Efficiency ratio = marginal / average — below 1 means growth is
   * profitable at current structure; above 1 means diseconomies of
   * scale are creeping in.
   */
  efficiencyRatio(scope: string, dimension: UnitDimension, windowMs: number): number | null {
    const c = this.unitCost(scope, dimension, windowMs);
    if (c === null || c.centsPerUnit === 0 || !Number.isFinite(c.centsPerUnit)) return null;
    return c.marginalCentsPerUnit / c.centsPerUnit;
  }
}
