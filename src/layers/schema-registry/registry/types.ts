/**
 * Schema Registry Types
 *
 * A record-style schema model (Avro/JSON-Schema-ish) used for real
 * field-level compatibility checking, canonical fingerprinting,
 * versioned subject storage, and cross-subject references.
 *
 * Schema documents are JSON values with this shape:
 *
 *   { "type": "record", "name": "User",
 *     "fields": [ { "name": "id", "type": "long" },
 *                  { "name": "email", "type": ["null", "string"], "default": null } ] }
 *
 * Types: 'null'|'boolean'|'int'|'long'|'float'|'double'|'string'|'bytes'
 * | 'record' | 'array' | 'map' | 'enum' | union (JSON array of types)
 * | named-type reference (string naming a defined record/enum).
 *
 * @module SchemaRegistry/Registry
 */

/** Compatibility modes (Confluent-style). */
export enum CompatibilityMode {
  /** New schema can read data written by the immediately previous. */
  BACKWARD = 'BACKWARD',
  /** Old schema can read data written by the new one. */
  FORWARD = 'FORWARD',
  /** Both backward and forward. */
  FULL = 'FULL',
  /** Backward against ALL prior versions. */
  BACKWARD_TRANSITIVE = 'BACKWARD_TRANSITIVE',
  /** Forward against ALL prior versions. */
  FORWARD_TRANSITIVE = 'FORWARD_TRANSITIVE',
  /** Full against ALL prior versions. */
  FULL_TRANSITIVE = 'FULL_TRANSITIVE',
  /** No checking. */
  NONE = 'NONE',
}

/** How a field changed between two schemas. */
export enum ChangeKind {
  FIELD_ADDED = 'field_added',
  FIELD_ADDED_WITH_DEFAULT = 'field_added_with_default',
  FIELD_REMOVED = 'field_removed',
  FIELD_REMOVED_HAD_DEFAULT = 'field_removed_had_default',
  FIELD_TYPE_WIDENED = 'field_type_widened',
  FIELD_TYPE_NARROWED = 'field_type_narrowed',
  FIELD_TYPE_CHANGED = 'field_type_changed',
  FIELD_RENAMED = 'field_renamed',
  FIELD_DEFAULT_CHANGED = 'field_default_changed',
}

/** One field-level difference found by the diff. */
export interface SchemaDiff {
  kind: ChangeKind;
  /** Dotted path, e.g. "address.zip". */
  path: string;
  detail: string;
}

/** Outcome of a compatibility check. */
export interface CompatibilityReport {
  compatible: boolean;
  /** Human-readable violations. */
  violations: string[];
  /** Full field-level diff (compatible or not). */
  diffs: SchemaDiff[];
}

/** A single registered schema version. */
export interface SchemaVersion {
  /** Globally unique id. */
  id: number;
  subject: string;
  version: number;
  /** Canonical JSON (sorted keys) of the schema document. */
  canonical: string;
  /** SHA-256 of canonical form. */
  fingerprint: string;
  /** Original schema as supplied (JSON value). */
  schema: unknown;
  /** Cross-subject references resolved at registration. */
  references: SchemaReference[];
  /** Soft-delete marker. */
  deleted: boolean;
  registeredAt: number;
}

/** A cross-subject schema reference. */
export interface SchemaReference {
  /** Local name used inside the schema. */
  name: string;
  subject: string;
  version: number;
}

/** Subject-level metadata. */
export interface Subject {
  name: string;
  compatibility: CompatibilityMode;
  /** Soft-deleted subjects reject new registrations but keep versions. */
  deleted: boolean;
  createdAt: number;
}

/** Registration outcome. */
export interface RegistrationResult {
  id: number;
  subject: string;
  version: number;
  /** True if an identical schema was already registered (idempotent). */
  alreadyRegistered: boolean;
  compatibility: CompatibilityReport;
}

/** Registry configuration. */
export interface RegistryConfig {
  /** Default compatibility for new subjects. */
  defaultCompatibility: CompatibilityMode;
  /** Allow type widening int->long->float->double where legal. */
  allowNumericWidening: boolean;
}

export const DEFAULT_REGISTRY_CONFIG: RegistryConfig = {
  defaultCompatibility: CompatibilityMode.BACKWARD,
  allowNumericWidening: true,
};

/** Error codes. */
export enum SchemaRegistryErrorCode {
  SUBJECT_NOT_FOUND = 'SUBJECT_NOT_FOUND',
  VERSION_NOT_FOUND = 'VERSION_NOT_FOUND',
  SCHEMA_NOT_FOUND = 'SCHEMA_NOT_FOUND',
  INCOMPATIBLE = 'INCOMPATIBLE',
  INVALID_SCHEMA = 'INVALID_SCHEMA',
  REFERENCE_NOT_FOUND = 'REFERENCE_NOT_FOUND',
  CIRCULAR_REFERENCE = 'CIRCULAR_REFERENCE',
  SUBJECT_DELETED = 'SUBJECT_DELETED',
  ALREADY_DELETED = 'ALREADY_DELETED',
}

export class RegistryError extends Error {
  readonly code: SchemaRegistryErrorCode;
  readonly details?: Record<string, unknown>;
  constructor(code: SchemaRegistryErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'RegistryError';
    this.code = code;
    this.details = details;
  }
}
