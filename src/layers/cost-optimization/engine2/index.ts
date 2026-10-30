/**
 * Cost Optimization — Engine2 public surface.
 *
 * Trend+seasonality cost forecasting, ROI-ranked savings
 * recommendations, unit economics (cost-per-X), and tag-level anomaly
 * root-cause decomposition.
 *
 * @module CostOptimization/Engine2
 */

export {
  CostForecaster,
  DEFAULT_FORECAST_CONFIG,
  InsufficientHistoryError,
  weekdayOf,
} from './CostForecaster';
export type {
  DailySpend,
  ForecastConfig,
  ForecastModel,
  ForecastPoint,
} from './CostForecaster';

export {
  DEFAULT_RANKER_CONFIG,
  RecommendationKind,
  RecommendationTier,
  SavingsRanker,
} from './SavingsRanker';
export type {
  RankedRecommendation,
  RankerConfig,
  SavingsRecommendation,
} from './SavingsRanker';

export { UnitDimension, UnitEconomics, UnitEconomicsError } from './UnitEconomics';
export type {
  CostStructure,
  UnitCost,
  UnitCostTrend,
  UnitObservation,
} from './UnitEconomics';

export { AnomalyRootCause, DEFAULT_ROOT_CAUSE_CONFIG } from './AnomalyRootCause';
export type {
  RootCauseCandidate,
  RootCauseConfig,
  RootCauseReport,
  TaggedSpendRecord,
} from './AnomalyRootCause';
