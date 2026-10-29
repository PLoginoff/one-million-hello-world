/**
 * Cost Optimization (FinOps) Engine Types
 *
 * Shared types for the FinOps engines: resource inventory with cost
 * attribution, idle detection, rightsizing, commitment coverage,
 * budgeting/forecasting, spend anomaly detection, and savings-plan
 * utilization.
 *
 * All monetary values are in USD-cents unless suffixed otherwise, to
 * avoid floating point drift on currency math.
 *
 * @module CostOptimizationLayer/Engines
 */

/** Injectable clock for deterministic windows and forecasts. */
export interface IClock {
  now(): number;
}

export class SystemClock implements IClock {
  now(): number {
    return Date.now();
  }
}

export class TestClock implements IClock {
  private _current: number;
  constructor(start: number = 0) {
    this._current = start;
  }
  now(): number {
    return this._current;
  }
  advance(ms: number): void {
    this._current += ms;
  }
  set(ms: number): void {
    this._current = ms;
  }
}

export const DAY_MS = 24 * 60 * 60 * 1000;
export const HOUR_MS = 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Resource inventory & cost attribution
// ---------------------------------------------------------------------------

export type ResourceKind = 'compute' | 'database' | 'storage' | 'network' | 'other';

export interface Resource {
  id: string;
  kind: ResourceKind;
  /** Instance size / SKU, e.g. 'm5.xlarge'. */
  size: string;
  /** Hourly on-demand cost in cents. */
  hourlyCostCents: number;
  /** Cost-relevant tags: 'cost-center', 'team', 'env', … */
  tags: Record<string, string>;
  /** True while the resource is running/provisioned. */
  active: boolean;
}

/** Well-known tag key used for cost-center attribution. */
export const COST_CENTER_TAG = 'cost-center';

/** Cost attribution rules — checked in order; first match wins. */
export interface AttributionRule {
  /** Tag key to inspect. */
  tagKey: string;
  /** Tag value -> cost center name. '*' is a catch-all for "tag present". */
  mapping: Record<string, string>;
  /** Fallback cost center when the tag is absent (null = unattributed). */
  fallback: string | null;
}

export interface CostBreakdown {
  costCenter: string;
  resourceCount: number;
  /** Sum of hourly cost across attributed resources, cents/hour. */
  hourlyCostCents: number;
  resourceIds: string[];
}

// ---------------------------------------------------------------------------
// Utilization & idle detection
// ---------------------------------------------------------------------------

/** A single utilization observation (percent 0..100). */
export interface UtilizationSample {
  resourceId: string;
  /** Metric name, e.g. 'cpu', 'memory', 'iops'. */
  metric: string;
  timestamp: number;
  /** 0–100 percent utilization. */
  percent: number;
}

export interface IdleReport {
  resourceId: string;
  metric: string;
  /** Computed percentile value (0-100). */
  percentileValue: number;
  /** Percentile used, e.g. 95 → p95. */
  percentile: number;
  sampleCount: number;
  /** True when below the configured idle threshold. */
  idle: boolean;
  /** Estimated cents/hour wasted while idle. */
  hourlyWasteCents: number;
}

// ---------------------------------------------------------------------------
// Rightsizing
// ---------------------------------------------------------------------------

/** A row in the size catalog: smaller index = smaller/cheaper. */
export interface SizeCatalogEntry {
  size: string;
  /** Capacity units — compared against observed usage percent. */
  capacityUnits: number;
  hourlyCostCents: number;
}

export interface RightsizeRecommendation {
  resourceId: string;
  currentSize: string;
  recommendedSize: string;
  /** Observed peak (p95) utilization percent. */
  observedP95: number;
  /** cents/hour saved; 0 when no recommendation. */
  hourlySavingsCents: number;
  reason: string;
}

// ---------------------------------------------------------------------------
// Commitment coverage (reserved / spot arbitrage)
// ---------------------------------------------------------------------------

export type CommitmentType = 'reserved' | 'savings-plan' | 'spot';

export interface Commitment {
  id: string;
  type: CommitmentType;
  /** Which resource sizes the commitment covers. */
  coveredSizes: string[];
  /** How many instance-hours per hour it covers. */
  unitsPerHour: number;
  /** Effective discounted hourly cost per unit, cents. */
  unitHourlyCostCents: number;
}

export interface CoverageAnalysis {
  /** Total steady-state instance-hours/hour across fleet. */
  totalDemandUnits: number;
  /** Instance-hours/hour covered by commitments. */
  coveredUnits: number;
  /** 0–100. */
  coveragePct: number;
  /** Demand still billed on-demand. */
  onDemandUnits: number;
  /** Hourly spend if all demand were on-demand, cents. */
  allOnDemandHourlyCents: number;
  /** Actual hourly spend with commitments, cents. */
  effectiveHourlyCents: number;
  /** Cents/hour saved vs all-on-demand. */
  savingsCents: number;
}

// ---------------------------------------------------------------------------
// Budgets & forecasting
// ---------------------------------------------------------------------------

export interface Budget {
  id: string;
  name: string;
  /** Scope filter — which cost center this budget governs. */
  costCenter: string;
  /** Period length in ms (e.g. 30 days for monthly). */
  periodMs: number;
  /** Budgeted amount in cents per period. */
  limitCents: number;
  /** Epoch ms when the current period began. */
  periodStart: number;
}

export interface SpendRecord {
  costCenter: string;
  timestamp: number;
  amountCents: number;
}

export interface BudgetStatus {
  budgetId: string;
  spentCents: number;
  limitCents: number;
  usedPct: number;
  /** ms remaining in the current period. */
  remainingMs: number;
  /** Projected end-of-period spend, cents. */
  forecastCents: number;
  /** True when forecast exceeds the limit. */
  forecastBreach: boolean;
  method: 'linear' | 'moving-average';
}

// ---------------------------------------------------------------------------
// Anomaly detection
// ---------------------------------------------------------------------------

export interface SpendAnomaly {
  costCenter: string;
  timestamp: number;
  amountCents: number;
  meanCents: number;
  stddevCents: number;
  zScore: number;
  direction: 'spike' | 'drop';
}

// ---------------------------------------------------------------------------
// Savings plan utilization
// ---------------------------------------------------------------------------

export interface SavingsPlanUsage {
  planId: string;
  /** Committed spend per hour in cents. */
  commitmentCentsPerHour: number;
  /** Records of eligible usage (timestamp + cents consumed). */
  usage: Array<{ timestamp: number; consumedCents: number }>;
}

export interface PlanUtilizationReport {
  planId: string;
  windowMs: number;
  committedCents: number;
  consumedCents: number;
  /** consumed/committed * 100; >100 means over-commit usage (good). */
  utilizationPct: number;
  /** Commitment paid but unused, cents. */
  wastedCents: number;
}
