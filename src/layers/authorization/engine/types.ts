/**
 * Authorization Engine — Shared Types
 *
 * Type definitions for the authz engine: RBAC with role hierarchy,
 * ABAC condition policies, deny-overrides evaluation, permission
 * caching, ownership checks, delegation and permission diffing.
 *
 * @module AuthorizationLayer/Engine
 */

/**
 * A permission string, conventionally `resource:action` or
 * `resource:action:scope`. Matching supports `*` as a whole-segment
 * wildcard: `doc:*`, `*:read`, `doc:read:*`.
 */
export type Permission = string;

/** A role in the RBAC model. */
export interface Role {
  readonly id: string;
  readonly name: string;
  /** Direct permissions granted by this role. */
  readonly permissions: readonly Permission[];
  /** Parent role ids — this role inherits everything they grant. */
  readonly inherits: readonly string[];
  readonly description?: string;
}

/** A permission explicitly attached to a subject (overrides/augments roles). */
export interface SubjectGrant {
  readonly permission: Permission;
  /** When set, the grant is a deny (overrides all allows). */
  readonly effect?: 'allow' | 'deny';
}

/** An actor requesting access. */
export interface Subject {
  readonly id: string;
  /** Assigned role ids. */
  readonly roles: readonly string[];
  /** Direct grants (allow or deny). */
  readonly grants?: readonly SubjectGrant[];
  /** ABAC attributes, e.g. `{ department: 'eng', clearance: 2 }`. */
  readonly attributes?: Record<string, unknown>;
}

/** A protected resource instance. */
export interface Resource {
  readonly id: string;
  /** Resource kind, e.g. `document`. */
  readonly type: string;
  /** Owning subject id (for ownership checks). */
  readonly ownerId?: string;
  /** ABAC attributes, e.g. `{ classification: 'secret' }`. */
  readonly attributes?: Record<string, unknown>;
}

/** Runtime environment attributes (time, IP, MFA, ...). */
export type Environment = Record<string, unknown>;

/** A single condition term inside an ABAC rule. */
export interface Condition {
  /** Dotted path into subject/resource/environment, e.g. `subject.department`. */
  readonly attr: string;
  readonly op:
    | 'eq'
    | 'neq'
    | 'lt'
    | 'lte'
    | 'gt'
    | 'gte'
    | 'in'
    | 'contains'
    | 'startsWith'
    | 'matches'
    | 'exists';
  readonly value?: unknown;
}

/**
 * An ABAC policy: grants `permissions` when ALL conditions hold.
 * `effect: 'deny'` produces a deny instead.
 */
export interface AttributePolicy {
  readonly id: string;
  readonly permissions: readonly Permission[];
  /** All conditions must be satisfied (AND semantics). */
  readonly conditions: readonly Condition[];
  readonly effect?: 'allow' | 'deny';
  readonly description?: string;
}

/** An access check request. */
export interface AccessRequest {
  readonly subject: Subject;
  readonly resource: Resource;
  readonly action: string;
  readonly environment?: Environment;
}

/** Final verdict of the evaluator. */
export interface AccessDecision {
  readonly allowed: boolean;
  /** 'deny' when a deny rule matched (deny-overrides). */
  readonly effect: 'allow' | 'deny';
  /** Human/audit-friendly explanation of what matched. */
  readonly reasons: readonly string[];
  /** Which sources contributed: roles, direct grants, ABAC, ownership, delegation. */
  readonly sources: readonly DecisionSource[];
  readonly fromCache?: boolean;
}

export type DecisionSource =
  | 'role'
  | 'direct-grant'
  | 'abac-policy'
  | 'ownership'
  | 'delegation'
  | 'default-deny';

/** A delegation: grantor lends permissions to a delegate until expiry. */
export interface Delegation {
  readonly id: string;
  readonly grantorId: string;
  readonly delegateId: string;
  readonly permissions: readonly Permission[];
  /** Restricted to a resource type (optional). */
  readonly resourceType?: string;
  /** Restricted to a specific resource (optional). */
  readonly resourceId?: string;
  readonly expiresAt: number;
  readonly createdAt: number;
  /** Whether the delegate may re-delegate (not implemented; reserved). */
  readonly transitive?: boolean;
}

/** Difference between two permission sets. */
export interface PermissionDiff {
  readonly added: readonly Permission[];
  readonly removed: readonly Permission[];
  readonly unchanged: readonly Permission[];
}

/** Injectable clock. */
export interface AuthzClock {
  now(): number;
}

export class SystemAuthzClock implements AuthzClock {
  now(): number {
    return Date.now();
  }
}
