/**
 * Data Quality Engine — public surface.
 *
 * Rules engine covering completeness, uniqueness, validity, consistency,
 * accuracy, freshness and anomaly dimensions; column profiling; scoring;
 * severity-based quarantine.
 *
 * @module DataQuality/Engine
 */

export {
  AccuracyRule,
  AnomalyRule,
  ColumnProfiler,
  CompletenessRule,
  ConsistencyRule,
  FreshnessRule,
  QualityEngine,
  UniquenessRule,
  ValidityRule,
} from './QualityRules';
export type {
  ColumnProfile,
  DQRow,
  QualityDimension,
  QualityReport,
  QualityRule,
  QuarantinePolicy,
  RuleContext,
  RuleResult,
  Severity,
  ValidityConstraint,
  Violation,
} from './QualityRules';

export { ColumnBuilder, ContractBuilder, checkSchemaConformance, defineContract } from './Contracts';
export type { ColumnContract, DataContract, SchemaDriftReport } from './Contracts';

export { BaselineStore, RuleCatalog } from './Baselines';
export type {
  ColumnDeviationReport,
  ColumnMetrics,
  MetricDeviation,
  RuleTemplate,
} from './Baselines';

export { driftReport, jsDivergence, ksTest, psi, reconcile } from './DriftDetection';
export type {
  FieldMismatch,
  NumericDrift,
  PsiResult,
  ReconciliationReport,
} from './DriftDetection';
