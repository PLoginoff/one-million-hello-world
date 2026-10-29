/**
 * Access Review Engine
 *
 * Runs access-certification campaigns: a campaign is a set of
 * (subject, grant, reviewer) entries each of which must be certified or
 * revoked before the campaign deadline.
 *
 * Semantics:
 * - Only the assigned reviewer may decide an entry (least-privilege check).
 * - A reviewer may not certify their *own* access (segregation of duties);
 *   such entries must be reassigned to another reviewer first.
 * - Entries still pending after `deadline` are reported as overdue.
 * - Closing a campaign defaults all remaining pending entries to
 *   `revoked` — fail closed, matching most compliance frameworks
 *   (unreviewed access is removed, not kept).
 *
 * Storage is a Map keyed by campaign id; entry lookup is O(E) per
 * campaign where E = entries, which is fine for campaign sizes (≤ ~10k).
 *
 * @module GovernanceLayer/Engines
 */

import {
  AccessReviewCampaign,
  AccessReviewEntry,
  CampaignStatus,
  CampaignSummary,
  IClock,
  ReviewDecision,
  SystemClock,
} from './types';

let campaignSeq = 0;
function nextCampaignId(): string {
  campaignSeq += 1;
  return `campaign-${campaignSeq.toString(36)}-${Date.now().toString(36)}`;
}

export class AccessReviewEngine {
  private readonly _campaigns: Map<string, AccessReviewCampaign>;
  private readonly _clock: IClock;

  constructor(clock: IClock = new SystemClock()) {
    this._campaigns = new Map();
    this._clock = clock;
  }

  /**
   * Create a campaign in Draft state. `entries` are copied defensively.
   * @param deadlineMs epoch ms after which pending entries are overdue.
   */
  createCampaign(
    name: string,
    entries: ReadonlyArray<Omit<AccessReviewEntry, 'decision' | 'decidedAt' | 'justification'>>,
    deadlineMs: number
  ): AccessReviewCampaign {
    const campaign: AccessReviewCampaign = {
      id: nextCampaignId(),
      name,
      status: CampaignStatus.Draft,
      createdAt: this._clock.now(),
      deadline: deadlineMs,
      entries: entries.map((e) => ({
        subjectId: e.subjectId,
        grant: e.grant,
        reviewerId: e.reviewerId,
        decision: ReviewDecision.Pending,
        decidedAt: null,
        justification: null,
      })),
    };
    this._campaigns.set(campaign.id, campaign);
    return campaign;
  }

  /** Move a draft campaign to Active so decisions may be recorded. */
  activate(campaignId: string): void {
    const c = this._require(campaignId);
    if (c.status !== CampaignStatus.Draft) {
      throw new Error(`Campaign ${campaignId} is not in draft state`);
    }
    c.status = CampaignStatus.Active;
  }

  /**
   * Record a certification or revocation decision.
   * @throws if the campaign is not active, the actor is not the assigned
   *         reviewer, or the reviewer would be certifying their own grant.
   */
  decide(
    campaignId: string,
    subjectId: string,
    grant: string,
    actorId: string,
    decision: ReviewDecision.Certified | ReviewDecision.Revoked,
    justification: string | null = null
  ): AccessReviewEntry {
    const c = this._require(campaignId);
    if (c.status !== CampaignStatus.Active) {
      throw new Error(`Campaign ${campaignId} is not active`);
    }
    const entry = this._findEntry(c, subjectId, grant);
    if (entry.reviewerId !== actorId) {
      throw new Error(
        `Entry for subject ${subjectId} grant ${grant} is assigned to ${entry.reviewerId}, not ${actorId}`
      );
    }
    if (decision === ReviewDecision.Certified && entry.subjectId === actorId) {
      throw new Error(
        `Segregation of duties: reviewer ${actorId} cannot certify their own access`
      );
    }
    entry.decision = decision;
    entry.decidedAt = this._clock.now();
    entry.justification = justification;
    return entry;
  }

  /** Reassign an entry to a different reviewer (e.g. to satisfy SoD). */
  reassign(campaignId: string, subjectId: string, grant: string, newReviewerId: string): void {
    const c = this._require(campaignId);
    const entry = this._findEntry(c, subjectId, grant);
    entry.reviewerId = newReviewerId;
  }

  /**
   * Close a campaign. Pending entries are auto-revoked (fail closed) with
   * a system justification. Returns the count auto-revoked.
   */
  close(campaignId: string): number {
    const c = this._require(campaignId);
    if (c.status === CampaignStatus.Closed) {
      throw new Error(`Campaign ${campaignId} already closed`);
    }
    let autoRevoked = 0;
    for (const e of c.entries) {
      if (e.decision === ReviewDecision.Pending) {
        e.decision = ReviewDecision.Revoked;
        e.decidedAt = this._clock.now();
        e.justification = 'auto-revoked: campaign closed with pending review';
        autoRevoked++;
      }
    }
    c.status = CampaignStatus.Closed;
    return autoRevoked;
  }

  /** Snapshot of campaign progress including overdue accounting. */
  summarize(campaignId: string): CampaignSummary {
    const c = this._require(campaignId);
    const now = this._clock.now();
    let certified = 0;
    let revoked = 0;
    let pending = 0;
    for (const e of c.entries) {
      if (e.decision === ReviewDecision.Certified) certified++;
      else if (e.decision === ReviewDecision.Revoked) revoked++;
      else pending++;
    }
    const overdue =
      now > c.deadline && c.status === CampaignStatus.Active ? pending : 0;
    return {
      campaignId: c.id,
      status: c.status,
      total: c.entries.length,
      certified,
      revoked,
      pending,
      overdue,
      completionPct: c.entries.length === 0 ? 100 : ((certified + revoked) / c.entries.length) * 100,
    };
  }

  /** All entries still pending past the deadline, across active campaigns. */
  overdueEntries(): Array<{ campaignId: string; entry: AccessReviewEntry }> {
    const now = this._clock.now();
    const out: Array<{ campaignId: string; entry: AccessReviewEntry }> = [];
    for (const c of this._campaigns.values()) {
      if (c.status !== CampaignStatus.Active || now <= c.deadline) continue;
      for (const e of c.entries) {
        if (e.decision === ReviewDecision.Pending) {
          out.push({ campaignId: c.id, entry: e });
        }
      }
    }
    return out;
  }

  getCampaign(campaignId: string): AccessReviewCampaign | null {
    return this._campaigns.get(campaignId) ?? null;
  }

  private _require(campaignId: string): AccessReviewCampaign {
    const c = this._campaigns.get(campaignId);
    if (!c) throw new Error(`Unknown campaign: ${campaignId}`);
    return c;
  }

  private _findEntry(
    c: AccessReviewCampaign,
    subjectId: string,
    grant: string
  ): AccessReviewEntry {
    const entry = c.entries.find((e) => e.subjectId === subjectId && e.grant === grant);
    if (!entry) {
      throw new Error(`No review entry for subject ${subjectId} grant ${grant}`);
    }
    return entry;
  }
}
