/**
 * Governance Engine Types
 *
 * Shared type definitions for the governance engines:
 * data classification, access reviews, policy exceptions,
 * retention enforcement, DSAR tracking, and control mapping.
 *
 * @module GovernanceLayer/Engines
 */

/** Injectable clock so every engine is deterministic under test. */
export interface IClock {
  now(): number;
}

/** Default wall-clock implementation. */
export class SystemClock implements IClock {
  now(): number {
    return Date.now();
  }
}

/** Mutable test clock — call {@link TestClock.advance} to move time. */
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

/** One day in milliseconds — convenience constant for policy math. */
export const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Data classification
// ---------------------------------------------------------------------------

/** Data sensitivity tiers, ordered from least to most restrictive. */
export enum ClassificationTier {
  Public = 'public',
  Internal = 'internal',
  Confidential = 'confidential',
  Restricted = 'restricted',
}

/** Numeric rank used to compare tiers (higher = more sensitive). */
export const TIER_RANK: Readonly<Record<ClassificationTier, number>> = {
  [ClassificationTier.Public]: 0,
  [ClassificationTier.Internal]: 1,
  [ClassificationTier.Confidential]: 2,
  [ClassificationTier.Restricted]: 3,
};

/** A rule that assigns a classification tier to matching resources. */
export interface ClassificationRule {
  /** Unique rule identifier. */
  id: string;
  /** Human-readable name. */
  name: string;
  /**
   * Field name on the resource's tag/metadata map to inspect.
   * Special value '*' matches the resource name itself.
   */
  field: string;
  /** Case-insensitive substring or exact pattern to match. */
  pattern: string;
  /** Whether {@link pattern} is treated as a regular expression. */
  regex: boolean;
  /** Tier assigned when the rule matches. */
  tier: ClassificationTier;
  /** Lower number = evaluated first; first match wins. */
  priority: number;
}

/** Handling obligations attached to a tier. */
export interface HandlingRules {
  tier: ClassificationTier;
  encryptionAtRest: boolean;
  encryptionInTransit: boolean;
  maskingRequired: boolean;
  auditLogging: boolean;
  allowedSharingScopes: ReadonlyArray<'public' | 'organization' | 'team' | 'named-users'>;
  maxRetentionDays: number | null;
  requiresDualControl: boolean;
}

/** Result of classifying one resource. */
export interface ClassificationResult {
  resourceId: string;
  tier: ClassificationTier;
  matchedRuleId: string | null;
  /** True when tier came from an explicit manual override, not a rule. */
  manualOverride: boolean;
  classifiedAt: number;
}

// ---------------------------------------------------------------------------
// Access review campaigns
// ---------------------------------------------------------------------------

export enum CampaignStatus {
  Draft = 'draft',
  Active = 'active',
  Closed = 'closed',
}

export enum ReviewDecision {
  Pending = 'pending',
  Certified = 'certified',
  Revoked = 'revoked',
}

/** One subject's access under review inside a campaign. */
export interface AccessReviewEntry {
  subjectId: string;
  /** The access grant under review (role, entitlement, etc.). */
  grant: string;
  reviewerId: string;
  decision: ReviewDecision;
  decidedAt: number | null;
  justification: string | null;
}

export interface AccessReviewCampaign {
  id: string;
  name: string;
  status: CampaignStatus;
  createdAt: number;
  /** Deadline (epoch ms). Entries still pending after this are overdue. */
  deadline: number;
  entries: AccessReviewEntry[];
}

export interface CampaignSummary {
  campaignId: string;
  status: CampaignStatus;
  total: number;
  certified: number;
  revoked: number;
  pending: number;
  overdue: number;
  completionPct: number;
}

// ---------------------------------------------------------------------------
// Policy exceptions
// ---------------------------------------------------------------------------

export enum ExceptionStatus {
  PendingApproval = 'pending-approval',
  Approved = 'approved',
  Rejected = 'rejected',
  Expired = 'expired',
}

export interface ApprovalStep {
  approverId: string;
  approvedAt: number;
  comment: string | null;
}

export interface PolicyException {
  id: string;
  policyId: string;
  requesterId: string;
  justification: string;
  status: ExceptionStatus;
  /** Ordered approval chain — all steps must approve before activation. */
  requiredApprovals: number;
  approvals: ApprovalStep[];
  /** Approver ids that rejected (any rejection rejects the exception). */
  rejectedBy: string | null;
  createdAt: number;
  /** Expiry (epoch ms); exception is inert after this instant. */
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// Retention schedules
// ---------------------------------------------------------------------------

export interface RetentionSchedule {
  id: string;
  /** Resource category the schedule applies to. */
  category: string;
  retentionDays: number;
  /** Disposition when the retention period elapses. */
  disposition: 'delete' | 'archive' | 'review';
}

export interface RetainedResource {
  resourceId: string;
  category: string;
  createdAt: number;
}

export enum DispositionAction {
  Retain = 'retain',
  Delete = 'delete',
  Archive = 'archive',
  LegalHold = 'legal-hold',
  Review = 'review',
}

export interface DispositionDecision {
  resourceId: string;
  action: DispositionAction;
  /** Schedule that produced the decision; null when held or unscheduled. */
  scheduleId: string | null;
  reason: string;
}

// ---------------------------------------------------------------------------
// Data subject access requests (DSAR)
// ---------------------------------------------------------------------------

export enum DsarState {
  Submitted = 'submitted',
  IdentityVerification = 'identity-verification',
  InProgress = 'in-progress',
  AwaitingResponse = 'awaiting-response',
  Completed = 'completed',
  Rejected = 'rejected',
}

export enum DsarKind {
  Access = 'access',
  Erasure = 'erasure',
  Rectification = 'rectification',
  Portability = 'portability',
  Restriction = 'restriction',
}

export interface DsarTransition {
  from: DsarState;
  to: DsarState;
  at: number;
  actorId: string;
  note: string | null;
}

export interface DsarRequest {
  id: string;
  subjectId: string;
  kind: DsarKind;
  state: DsarState;
  submittedAt: number;
  /** Statutory deadline (epoch ms). */
  dueAt: number;
  completedAt: number | null;
  history: DsarTransition[];
}

// ---------------------------------------------------------------------------
// Compliance control mapping
// ---------------------------------------------------------------------------

export enum ControlStatus {
  Compliant = 'compliant',
  Partial = 'partial',
  NonCompliant = 'non-compliant',
  NotAssessed = 'not-assessed',
}

export interface Evidence {
  id: string;
  controlId: string;
  title: string;
  /** Where the artifact lives (URI, ticket id, etc.). */
  reference: string;
  collectedAt: number;
  /** Evidence older than this is stale and discounted. */
  validUntil: number | null;
}

export interface ComplianceControl {
  id: string;
  /** Framework + clause, e.g. 'SOC2-CC6.1', 'GDPR-Art32'. */
  frameworkRef: string;
  title: string;
  status: ControlStatus;
  evidenceIds: string[];
  lastAssessedAt: number | null;
}

export interface ControlAssessment {
  controlId: string;
  frameworkRef: string;
  status: ControlStatus;
  evidenceCount: number;
  freshEvidenceCount: number;
  staleEvidenceCount: number;
}
