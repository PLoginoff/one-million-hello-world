/**
 * Schema Registry — real versioned schema management.
 */

export {
  CompatibilityMode,
  ChangeKind,
  SchemaRegistryErrorCode,
  RegistryError,
  DEFAULT_REGISTRY_CONFIG,
} from './types';
export type {
  SchemaDiff,
  CompatibilityReport,
  SchemaVersion,
  SchemaReference,
  Subject,
  RegistrationResult,
  RegistryConfig,
} from './types';

export {
  PRIMITIVE_TYPES,
  canonicalizeSchema,
  fingerprint,
  isObject,
  isRecord,
  recordFields,
  validateSchema,
  typeCompatible,
} from './SchemaModel';
export type { FieldDef, RecordDef } from './SchemaModel';

export { CompatibilityChecker } from './CompatibilityChecker';
export { ReferenceGraph } from './ReferenceGraph';
export { SubjectStore } from './SubjectStore';
export { SchemaRegistryEngine } from './SchemaRegistryEngine';
export { DataValidator } from './DataValidator';
export type { ValidationIssue } from './DataValidator';
export { MigrationPlanner, MigrationOp } from './MigrationPlanner';
export type { MigrationStep, MigrationPlan } from './MigrationPlanner';
export { SchemaNormalizer, typeTableFromRefs } from './SchemaNormalizer';
export type { TypeTable } from './SchemaNormalizer';
