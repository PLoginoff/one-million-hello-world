/**
 * Configuration Engine2 — public exports.
 *
 * Second-generation modules on top of `engine/`:
 *   - JsonSchemaValidator — JSON-Schema-style nested validation
 *   - DriftDetector       — cross-environment drift + tolerance policies
 *   - SecretRefResolver   — ${secret:key} resolution + rotation hooks
 *   - ConfigHistory       — attributed change log + rollback computation
 *   - ConfigNamespace     — feature-scoped prefix views + sub-schemas
 *
 * @module Configuration/Engine2
 */

export { JsonSchemaValidator } from './JsonSchemaValidator';
export type {
  JsonSchemaLike,
  SchemaViolationV2,
  ValidationResult,
} from './JsonSchemaValidator';

export { DriftDetector } from './DriftDetector';
export type {
  DriftKind,
  PathDrift,
  DriftReport,
  DriftPolicy,
} from './DriftDetector';

export { SecretRefResolver } from './SecretRefResolver';
export type {
  SecretGetter,
  RotationHook,
  SecretRef,
  ResolveResult,
} from './SecretRefResolver';

export { ConfigHistory, TOMBSTONE } from './ConfigHistory';
export type {
  ChangeSet,
  RollbackEntry,
  ConfigHistoryOptions,
} from './ConfigHistory';

export { ConfigNamespace } from './ConfigNamespace';

export { ConfigTemplates } from './ConfigTemplate';
export type { EnvSpec } from './ConfigTemplate';

export { ApprovalGate } from './ApprovalGate';
export type {
  ProposedChange,
  RequestStatus,
  ChangeRequest,
  ProtectionRule,
  ApprovalGateOptions,
} from './ApprovalGate';
