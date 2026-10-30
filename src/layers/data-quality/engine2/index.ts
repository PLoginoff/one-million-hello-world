/**
 * Data Quality — Engine2 public surface.
 *
 * Deep column profiling (cardinality, top-k, histograms, patterns),
 * weighted composite scoring, trend tracking with regression
 * detection, and validation-rule suggestions inferred from profiles.
 *
 * @module DataQuality/Engine2
 */

export { DeepProfiler, DEFAULT_PROFILER_CONFIG, StringPattern } from './DataProfiler';
export type {
  DeepColumnProfile,
  FrequentValue,
  HistogramBucket,
  ProfilerConfig,
} from './DataProfiler';

export { DEFAULT_SCORING_CONFIG, QualityScorer } from './QualityScoring';
export type {
  DimensionGrading,
  DimensionScore,
  QualityScore,
  ScoringConfig,
} from './QualityScoring';

export { DEFAULT_TREND_CONFIG, QualityTrendTracker, SystemQualityClock } from './QualityTrend';
export type {
  ChangePoint,
  QualityClock,
  RegressionAlert,
  ScoreObservation,
  TrendAnalysis,
  TrendConfig,
} from './QualityTrend';

export { DEFAULT_SUGGESTER_CONFIG, RuleSuggester } from './RuleSuggester';
export type { SuggestedRule, SuggesterConfig } from './RuleSuggester';
