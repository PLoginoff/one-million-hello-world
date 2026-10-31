/**
 * Audit Engine3 — public exports.
 *
 * @module AuditLayer/Engine3
 */

export * from './types3';
export {
  Notarizer,
  InMemoryAnchorService,
  buildMerkleTree,
  merkleProof,
  verifyMerkleProof,
  GENESIS_ANCHOR,
} from './Notarizer';
export type { NotarizerOptions } from './Notarizer';
export { SegmentCompactor } from './SegmentCompactor';
export type { CompactorOptions } from './SegmentCompactor';
export { AuditAlertStreamer, compileFilter } from './AlertStreamer';
export type { AlertStreamerOptions } from './AlertStreamer';
export { ComplianceExportScheduler } from './ComplianceExportScheduler';
export type { ExportSchedulerOptions, RecordSource } from './ComplianceExportScheduler';
export { ChainAnchorer, ChainIntegrityError } from './ChainAnchorer';
export type { AnchorerOptions, AnchorCycle, AnchorerStatus } from './ChainAnchorer';
export { ProofJournal, GENESIS_ATTESTATION } from './ProofJournal';
export type {
  VerificationSweep,
  Attestation,
  Investigation,
  InvestigationNote,
  InvestigationStatus,
  CoverageGap,
  JournalStats,
} from './ProofJournal';
export { ErasureLedger, GENESIS_ERASURE } from './ErasureLedger';
export type { ErasureMethod, ErasureReceipt, ErasureRequest, ErasureStatus } from './ErasureLedger';
export { AnchorRegistry } from './AnchorRegistry';
export type { RegisteredAnchor, AnchorConflict, RegistryGap, RegistryStats } from './AnchorRegistry';
export { RecordRedactor } from './RecordRedactor';
export type { RedactedRecord } from './RecordRedactor';
export { SegmentIndex } from './SegmentIndex';
export type { SegmentGap, ContinuityReport } from './SegmentIndex';
