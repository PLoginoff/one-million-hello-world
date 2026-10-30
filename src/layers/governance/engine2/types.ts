/**
 * Governance Engine2 — shared types.
 *
 * Type definitions for the governance-automation module: a retention
 * *executor* that actually deletes expired resources (the existing
 * RetentionEngine only computes dispositions), recurring access-review
 * campaigns with reminder scheduling, a configuration compliance
 * scanner, and a cron-style audit-report scheduler.
 *
 * @module GovernanceLayer/Engine2
 */

/** Injectable clock. */
export interface IClock {
  now(): number;
}

export class SystemClock implements IClock {
  now(): number {
    return Date.now();
  }
}

/** Mutable test clock. */
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

export const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Retention executor
// ---------------------------------------------------------------------------

/** A resource subject to retention rules. */
export interface ManagedResource {
  id: string;
  category: string;
  createdAt: number;
  /** Optional owner (for reporting). */
  owner?: string;
}

/** Retention rule: delete resources of `category` after `retainMs`. */
export interface RetentionRule {
  category: string;
  retainMs: number;
}

/** What happened to one resource in an executor pass. */
export interface Disposition {
  resourceId: string;
  action: 'deleted' | 'retained' | 'legal-hold';
  /** Rule that fired, when relevant. */
  rule: string | null;
  /** Age at decision time, ms. */
  ageMs: number;
}

// ---------------------------------------------------------------------------
// Access review campaigns
// ---------------------------------------------------------------------------

export enum CampaignState {
  Open = 'open',
  Closed = 'closed',
}

/** One access grant up for certification. */
export interface ReviewItem {
  id: string;
  campaignId: string;
  /** User whose access is being reviewed. */
  subject: string;
  /** The grant/role being certified. */
  grant: string;
  /** Reviewer responsible for this item. */
  reviewer: string;
  decision: 'pending' | 'certified' | 'revoked';
  decidedAt: number | null;
}

export interface ReviewCampaign {
  id: string;
  name: string;
  state: CampaignState;
  openedAt: number;
  deadline: number;
  /** ms between reminders to pending reviewers. */
  reminderIntervalMs: number;
  /** Last time reminders were emitted. */
  lastReminderAt: number | null;
}

// ---------------------------------------------------------------------------
// Policy violation scanner
// ---------------------------------------------------------------------------

/** One resource/config object under policy scan. */
export interface ScannableConfig {
  id: string;
  /** Config kind, e.g. "bucket", "iam-role", "db". */
  kind: string;
  /** Arbitrary flat config attributes. */
  attrs: Readonly<Record<string, unknown>>;
}

/** A declarative rule: configs of `kind` where `field` violates `op`. */
export interface PolicyRule {
  id: string;
  name: string;
  kind: string;
  field: string;
  op: 'equals' | 'not-equals' | 'contains' | 'missing' | 'present' | 'gt' | 'lt';
  /** Expected value for equals/not-equals/contains/gt/lt. */
  value?: unknown;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/** A detected violation. */
export interface Violation {
  ruleId: string;
  configId: string;
  severity: PolicyRule['severity'];
  /** The attribute value that violated (when present). */
  observed: unknown;
  at: number;
}

// ---------------------------------------------------------------------------
// Report scheduler
// ---------------------------------------------------------------------------

/** A registered report job with a cron-ish period. */
export interface ReportJob {
  id: string;
  name: string;
  /** Interval between runs, ms (simplified cron — every intervalMs). */
  intervalMs: number;
  /** Epoch ms of next scheduled run. */
  nextRunAt: number;
  /** Last generated report, if any. */
  lastRunAt: number | null;
}

/** Output of one report run. */
export interface AuditReport {
  jobId: string;
  generatedAt: number;
  /** Report payload — produced by the registered generator. */
  payload: string;
}
