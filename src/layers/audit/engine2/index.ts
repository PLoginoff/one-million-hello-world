/**
 * Audit Engine2 — public exports.
 *
 * @module AuditLayer/Engine2
 */

export { ComplianceReportGenerator, DEFAULT_CONTROL_MAPPINGS } from './ComplianceReportGenerator';
export type {
  ComplianceFramework,
  ControlMapping,
  ControlFinding,
  ControlStatus,
  ComplianceReportV2,
  ComplianceGeneratorOptions,
} from './ComplianceReportGenerator';
export { AuditLogSearch, parseSearchQuery } from './AuditLogSearch';
export type { SearchHit, SearchOptions } from './AuditLogSearch';
export { LogShipper, InMemoryLogSink2 } from './LogShipper';
export type { LogSink2, ShipperConfig, ShipperStats } from './LogShipper';
export { RetentionSimulator } from './RetentionSimulator';
export type {
  PlannedAction,
  RecordPlan,
  TierProjection,
  SimulationReport,
  PolicyComparison,
} from './RetentionSimulator';
export { SessionCorrelator } from './SessionCorrelator';
export type { CorrelationChain, Session, CorrelatorOptions } from './SessionCorrelator';
