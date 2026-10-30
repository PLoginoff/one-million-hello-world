/**
 * Authorization Engine2 — Shared Types
 *
 * Second-generation authz primitives: obligations attached to policy
 * decisions, resource-hierarchy permission inheritance, time-bounded
 * access (schedule windows + temporary grants), and bulk authorization
 * with shared-prefix optimization.
 *
 * @module AuthorizationLayer/Engine2
 */

/** Injectable clock for schedules and temporary grants. */
export interface AuthzClock {
  now(): number;
}

export class SystemAuthzClock implements AuthzClock {
  now(): number {
    return Date.now();
  }
}

export class ManualAuthzClock implements AuthzClock {
  private _t: number;
  constructor(start: number = 0) {
    this._t = start;
  }
  now(): number {
    return this._t;
  }
  advance(ms: number): void {
    this._t += ms;
  }
  set(ms: number): void {
    this._t = ms;
  }
}

// ---------------------------------------------------------------------------
// Obligations — post-decision actions the PEP must perform
// ---------------------------------------------------------------------------

/**
 * An obligation fires when its triggering effect matches the decision.
 * `log` records an access event; `notify` alerts a channel; `requireMfa`
 * upgrades an allow to "allow only if MFA proven"; `rateLimit` attaches
 * a budget hint for the caller.
 */
export type ObligationKind = 'log' | 'notify' | 'requireMfa' | 'rateLimit' | 'custom';

export interface Obligation {
  readonly id: string;
  readonly kind: ObligationKind;
  /** Fire on 'allow', 'deny', or 'both' (default 'both'). */
  readonly on?: 'allow' | 'deny' | 'both';
  /** Obligation parameters, e.g. `{ channel: 'secops', message: ... }`. */
  readonly params?: Readonly<Record<string, unknown>>;
}

/** An obligation that matched a decision and is due for execution. */
export interface DueObligation extends Obligation {
  readonly decisionEffect: 'allow' | 'deny';
  readonly subjectId: string;
  readonly permission: string;
}

/** Sink for executed obligations — PEP wires real handlers in. */
export interface ObligationHandler {
  execute(due: DueObligation): void | Promise<void>;
}

/** Collects due obligations in memory — audit/tests. */
export class InMemoryObligationHandler implements ObligationHandler {
  readonly executed: DueObligation[] = [];
  execute(due: DueObligation): void {
    this.executed.push(due);
  }
}

// ---------------------------------------------------------------------------
// Resource hierarchy — permission inheritance folder → document
// ---------------------------------------------------------------------------

/**
 * A node in a resource hierarchy. Resources grant the permissions of
 * their ancestors transitively: access to `folder:root` may confer
 * `read` on every descendant document.
 */
export interface HierarchyNode {
  readonly resourceId: string;
  readonly parentId?: string;
}

/** A grant attached to a hierarchy node (applies to descendants too). */
export interface NodeGrant {
  readonly resourceId: string;
  /** Subject or role that owns the grant. */
  readonly principal: string;
  /** Permissions granted at this node — inherited downward. */
  readonly permissions: readonly string[];
  readonly effect?: 'allow' | 'deny';
}

// ---------------------------------------------------------------------------
// Time-based access
// ---------------------------------------------------------------------------

/**
 * A recurring daily access window, e.g. business hours 09:00–17:00 UTC.
 * `startMinuteOfDay`/`endMinuteOfDay` in minutes since UTC midnight.
 */
export interface AccessWindow {
  readonly id: string;
  readonly subjectId: string;
  readonly permission: string;
  /** Minutes since UTC day start (0–1439); wraps overnight when end < start. */
  readonly startMinuteOfDay: number;
  readonly endMinuteOfDay: number;
  /** Optional epoch-ms bounds — window is inert outside them. */
  readonly validFromMs?: number;
  readonly validUntilMs?: number;
}

/** A temporary grant — self-expiring permission. */
export interface TemporaryGrant {
  readonly id: string;
  readonly subjectId: string;
  readonly permission: string;
  readonly grantedAtMs: number;
  readonly expiresAtMs: number;
  readonly grantedBy?: string;
  readonly reason?: string;
}

// ---------------------------------------------------------------------------
// Bulk authorization
// ---------------------------------------------------------------------------

export interface BulkCheckRequest {
  readonly subjectId: string;
  readonly permissions: readonly string[];
}

export interface BulkCheckResult {
  readonly subjectId: string;
  /** permission → allowed. */
  readonly results: Readonly<Record<string, boolean>>;
  /** Permissions short-circuited by prefix-trie optimization. */
  readonly shortCircuited: readonly string[];
}

/** The per-permission checker the bulk engine optimizes around. */
export type PermissionChecker = (subjectId: string, permission: string) => boolean;
