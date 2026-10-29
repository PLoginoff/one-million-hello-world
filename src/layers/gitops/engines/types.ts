/**
 * GitOps Engine Types
 *
 * Shared types for the GitOps engines: desired-state store, drift
 * detection, dependency-ordered reconciliation, sync waves, post-apply
 * health assessment, rollback, commit metadata, and policy gates.
 *
 * Resources are modeled generically (kind + name + spec map) so the
 * engines work for any declarative substrate — Kubernetes-style
 * manifests, Terraform state, or internal service specs.
 *
 * @module GitopsLayer/Engines
 */

/** Injectable clock for commit metadata and health probing. */
export interface IClock {
  now(): number;
}

export class SystemClock implements IClock {
  now(): number {
    return Date.now();
  }
}

export class TestClock implements IClock {
  private _current: number;
  constructor(start: number = 0) {
    this._current = start;
  }
  now(): number {
    return this._current;
  }
  advance(ms: number): void {
    this._current += ms;
  }
  set(ms: number): void {
    this._current = ms;
  }
}

// ---------------------------------------------------------------------------
// Resources & desired state
// ---------------------------------------------------------------------------

/** Canonical resource identifier within a spec. */
export function resourceKey(kind: string, name: string): string {
  return `${kind}/${name}`;
}

/** A declared (desired) or observed (live) resource. */
export interface ResourceSpec {
  kind: string;
  name: string;
  /** Arbitrary declarative spec — compared field-by-field for drift. */
  spec: Record<string, unknown>;
  /** Resource keys this resource depends on (applied first). */
  dependsOn: string[];
  /** Sync wave number; lower waves apply before higher. Default 0. */
  wave: number;
}

/**
 * A revision of the desired state — what a git commit represents.
 */
export interface DesiredRevision {
  id: string;
  /** Commit metadata. */
  commit: CommitMeta;
  /** All resources in this revision, keyed by resourceKey. */
  resources: Map<string, ResourceSpec>;
}

export interface CommitMeta {
  sha: string;
  author: string;
  message: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Drift
// ---------------------------------------------------------------------------

export enum DiffAction {
  Create = 'create',
  Update = 'update',
  Delete = 'delete',
  Noop = 'noop',
}

/** One field-level difference between desired and live. */
export interface FieldDiff {
  path: string;
  desired: unknown;
  live: unknown;
}

export interface ResourceDiff {
  key: string;
  kind: string;
  name: string;
  action: DiffAction;
  /** Field-level differences; empty for create/delete. */
  fieldDiffs: FieldDiff[];
  wave: number;
  dependsOn: string[];
}

export interface DriftReport {
  revisionId: string;
  diffs: ResourceDiff[];
  inSync: boolean;
  creates: number;
  updates: number;
  deletes: number;
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

export interface LiveStore {
  get(key: string): ResourceSpec | null;
  set(key: string, spec: ResourceSpec): void;
  delete(key: string): boolean;
  keys(): string[];
}

export enum StepStatus {
  Applied = 'applied',
  Failed = 'failed',
  Skipped = 'skipped',
}

export interface ReconcileStep {
  diff: ResourceDiff;
  status: StepStatus;
  error: string | null;
}

export interface ReconcileResult {
  revisionId: string;
  steps: ReconcileStep[];
  applied: number;
  failed: number;
  /** True when every step applied. */
  success: boolean;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export enum HealthStatus {
  Healthy = 'healthy',
  Degraded = 'degraded',
  Unhealthy = 'unhealthy',
  Unknown = 'unknown',
}

/** A probe hook evaluates one applied resource's health. */
export type HealthProbe = (resource: ResourceSpec) => HealthStatus | Promise<HealthStatus>;

export interface HealthReport {
  resourceKey: string;
  status: HealthStatus;
  detail: string | null;
}

// ---------------------------------------------------------------------------
// Policy gates
// ---------------------------------------------------------------------------

export interface PolicyViolation {
  ruleId: string;
  resourceKey: string;
  message: string;
}

/**
 * A gate rule inspects a resource spec before apply. Return a violation
 * message to deny, or null to allow.
 */
export type PolicyRule = (resource: ResourceSpec) => string | null;

export interface GateResult {
  allowed: boolean;
  violations: PolicyViolation[];
}
