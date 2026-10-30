/**
 * Audit Engine — public exports.
 *
 * @module AuditLayer/Engine
 */

export * from './types';
export {
  GENESIS_HASH,
  canonicalJson,
  computeRecordHash,
  sealRecord,
  verifyRecord,
  verifyChain,
} from './HashChain';
export { AuditStore } from './AuditStore';
export {
  RetentionManager,
  DEFAULT_RETENTION_POLICY,
  holdMatches,
} from './RetentionManager';
export type { RetentionSweepResult } from './RetentionManager';
export { AnomalyDetector } from './AnomalyDetector';
export type { AnomalyDetectorConfig } from './AnomalyDetector';
export {
  toCefLine,
  toCsvLine,
  toJsonLine,
  exportRecords,
  contentTypeFor,
  AUDIT_CSV_HEADER,
} from './AuditExporter';
export type { AuditExportFormat } from './AuditExporter';
export { AuditPipeline } from './AuditPipeline';
export type { AuditPipelineConfig, ComplianceReport } from './AuditPipeline';
