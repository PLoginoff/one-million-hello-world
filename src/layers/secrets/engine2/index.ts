/**
 * Secrets Engine2 — public exports.
 *
 * Second-generation modules on top of `vault/`:
 *   - SecretVersionHistory    — version lines, rollback, fingerprints
 *   - AccessTracker           — per-principal/per-path usage aggregation
 *   - RotationPlanner         — jittered scheduling, backoff, warnings
 *   - SecretTemplates         — standard secret shapes + wire format
 *   - AccessAnomalyDetector   — volume/novelty/off-hours/enumeration signals
 *
 * @module Secrets/Engine2
 */

export { SecretVersionHistory } from './VersionHistory';
export type {
  VersionInfo,
  VersionDiff,
  TimelineEvent,
} from './VersionHistory';

export { AccessTracker } from './AccessTracker';
export type {
  ConsumerInfo,
  SecretFootprint,
  AccessTrackerOptions,
} from './AccessTracker';

export { RotationPlanner } from './RotationPlanner';
export type {
  RotationPolicy,
  RotationState,
  PlannedRotation,
  PolicyWarning,
  RotationPlannerOptions,
} from './RotationPlanner';

export { SecretTemplates } from './SecretTemplates';
export type {
  FieldType,
  TemplateField,
  SecretTemplate,
  ValidationIssue,
} from './SecretTemplates';

export { AccessAnomalyDetector, replayAuditLog } from './AccessAnomalyDetector';
export type {
  AnomalySignal,
  AccessAlert,
  AnomalyOptions,
} from './AccessAnomalyDetector';

export { LeaseStore } from './LeaseStore';
export type { StoredLease, LeaseStoreOptions } from './LeaseStore';
