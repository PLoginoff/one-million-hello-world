/**
 * Chaos Engineering — Engine2 public surface.
 *
 * Experiment result analysis (Welch's t-test on before/during steady
 * state), pre-flight safety validation, and dependency-aware blast-cone
 * mapping.
 *
 * @module ChaosEngineering/Engine2
 */

export {
  AnalysisInputError,
  DEFAULT_ANALYZER_CONFIG,
  DeviationDirection,
  ExperimentResultAnalyzer,
  formatAnalysisReport,
  tTwoTailedP,
  VerdictPolicy,
} from './ExperimentResultAnalyzer';
export type {
  AnalyzedSeries,
  ExperimentAnalysis,
  ExperimentAnalyzerConfig,
  MetricComparison,
  MetricSeries,
  PhaseSample,
  RecoveryAssessment,
  SampleWindow,
  WindowStats,
} from './ExperimentResultAnalyzer';

export {
  ChaosSafetyValidator,
  DEFAULT_SAFETY_CONFIG,
  FindingSeverity,
  MalformedExperimentError,
} from './ChaosSafetyValidator';
export type {
  SafetyFinding,
  SafetyValidatorConfig,
  ValidationVerdict,
} from './ChaosSafetyValidator';

export { DependencyChaosMap, DependencyMapError, ServiceTier } from './DependencyChaosMap';
export type {
  BlastCone,
  DependencyEdge,
  DependencyMapConfig,
  ExperimentTargetBinding,
  ServiceImpact,
  ServiceNode,
} from './DependencyChaosMap';
