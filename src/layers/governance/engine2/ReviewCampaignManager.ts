/**
 * Review Campaign Manager
 *
 * Runs periodic access-certification *campaigns*: recurring review
 * cycles where each (subject, grant) pair must be certified or revoked
 * by a named reviewer before the deadline, with automated reminders
 * while items remain pending.
 *
 * Unlike the lower-level AccessReviewEngine (single-pass), campaigns
 * here are first-class objects that tick: call {@link tick} periodically
 * (cron) to emit reminder notifications to reviewers with pending items
 * once `reminderIntervalMs` has elapsed since the last reminder.
 *
 * Safeguards:
 * - Only the assigned reviewer may decide an item.
 * - A reviewer cannot certify their OWN access (SoD) — such items must
 *   be reassigned first.
 * - Closing a campaign fails closed: every still-pending item is
 *   auto-revoked.
 *
 * Storage is `Map<campaignId, items[]>` — O(1) campaign lookup, O(I)
 * per-item ops where I = items in that campaign.
 *
 * @module GovernanceLayer/Engine2
 */

import {
  CampaignState,
  IClock,
  ReviewCampaign,
  ReviewItem,
  SystemClock,
} from './types';

let campaignSeq = 0;
let itemSeq = 0;
function nextCampaignId(): string {
  campaignSeq += 1;
  return `camp-${campaignSeq.toString(36)}`;
}
function nextItemId(): string {
  itemSeq += 1;
  return `item-${itemSeq.toString(36)}`;
}

/** A reminder nudge produced by {@link tick}. */
export interface Reminder {
  campaignId: string;
  reviewer: string;
  pendingCount: number;
  emittedAt: number;
}

export class ReviewCampaignManager {
  private readonly _campaigns: Map<string, ReviewCampaign>;
  private readonly _items: Map<string, ReviewItem[]>;
  private readonly _clock: IClock;

  constructor(clock: IClock = new SystemClock()) {
    this._campaigns = new Map();
    this._items = new Map();
    this._clock = clock;
  }

  /** Open a campaign; items are added via {@link addItem}. */
  open(name: string, deadlineInMs: number, reminderIntervalMs: number): ReviewCampaign {
    const now = this._clock.now();
    const camp: ReviewCampaign = {
      id: nextCampaignId(),
      name,
      state: CampaignState.Open,
      openedAt: now,
      deadline: now + deadlineInMs,
      reminderIntervalMs,
      lastReminderAt: null,
    };
    this._campaigns.set(camp.id, camp);
    this._items.set(camp.id, []);
    return camp;
  }

  /** Add a (subject, grant, reviewer) item to a campaign. */
  addItem(campaignId: string, subject: string, grant: string, reviewer: string): ReviewItem {
    const items = this._requireItems(campaignId);
    const item: ReviewItem = {
      id: nextItemId(),
      campaignId,
      subject,
      grant,
      reviewer,
      decision: 'pending',
      decidedAt: null,
    };
    items.push(item);
    return item;
  }

  /** Reassign an item to a different reviewer (e.g. SoD conflict). */
  reassign(campaignId: string, itemId: string, newReviewer: string): ReviewItem {
    const item = this._requireItem(campaignId, itemId);
    if (item.decision !== 'pending') throw new Error(`Item ${itemId} already decided`);
    item.reviewer = newReviewer;
    return item;
  }

  /** Reviewer certifies the access. */
  certify(campaignId: string, itemId: string, reviewer: string): ReviewItem {
    return this._decide(campaignId, itemId, reviewer, 'certified');
  }

  /** Reviewer revokes the access. */
  revoke(campaignId: string, itemId: string, reviewer: string): ReviewItem {
    return this._decide(campaignId, itemId, reviewer, 'revoked');
  }

  /**
   * Tick: emit reminders to reviewers with pending items once their
   * campaign's reminder interval has elapsed. Returns the reminders
   * sent — callers deliver them via email/Slack/etc.
   */
  tick(): Reminder[] {
    const now = this._clock.now();
    const out: Reminder[] = [];
    for (const camp of this._campaigns.values()) {
      if (camp.state !== CampaignState.Open) continue;
      const last = camp.lastReminderAt ?? camp.openedAt;
      if (now - last < camp.reminderIntervalMs) continue;
      // Group pending items by reviewer — one reminder per reviewer.
      const pending = new Map<string, number>();
      for (const item of this._items.get(camp.id) ?? []) {
        if (item.decision === 'pending') {
          pending.set(item.reviewer, (pending.get(item.reviewer) ?? 0) + 1);
        }
      }
      if (pending.size === 0) continue;
      camp.lastReminderAt = now;
      for (const [reviewer, count] of pending) {
        out.push({ campaignId: camp.id, reviewer, pendingCount: count, emittedAt: now });
      }
    }
    return out;
  }

  /**
   * Close a campaign: every still-pending item is auto-revoked
   * (fail closed — unreviewed access is removed).
   */
  close(campaignId: string): ReviewCampaign {
    const camp = this._require(campaignId);
    camp.state = CampaignState.Closed;
    const now = this._clock.now();
    for (const item of this._items.get(campaignId) ?? []) {
      if (item.decision === 'pending') {
        item.decision = 'revoked';
        item.decidedAt = now;
      }
    }
    return camp;
  }

  campaign(id: string): ReviewCampaign | null {
    return this._campaigns.get(id) ?? null;
  }

  items(campaignId: string): ReviewItem[] {
    return [...(this._items.get(campaignId) ?? [])];
  }

  /** Summary counts for a campaign. */
  summary(campaignId: string): { pending: number; certified: number; revoked: number; overdue: boolean } {
    const items = this._items.get(campaignId) ?? [];
    const camp = this._require(campaignId);
    let pending = 0;
    let certified = 0;
    let revoked = 0;
    for (const i of items) {
      if (i.decision === 'pending') pending++;
      else if (i.decision === 'certified') certified++;
      else revoked++;
    }
    return {
      pending,
      certified,
      revoked,
      overdue: camp.state === CampaignState.Open && this._clock.now() > camp.deadline,
    };
  }

  // ------------------------------------------------------------------
  // internals
  // ------------------------------------------------------------------

  private _decide(
    campaignId: string,
    itemId: string,
    reviewer: string,
    decision: 'certified' | 'revoked'
  ): ReviewItem {
    const camp = this._require(campaignId);
    if (camp.state !== CampaignState.Open) throw new Error(`Campaign ${campaignId} is closed`);
    const item = this._requireItem(campaignId, itemId);
    if (item.reviewer !== reviewer) {
      throw new Error(`Item ${itemId} is assigned to ${item.reviewer}, not ${reviewer}`);
    }
    // Segregation of duties: a reviewer may not certify their own access.
    if (decision === 'certified' && item.subject === reviewer) {
      throw new Error(`Reviewer ${reviewer} cannot certify their own access — reassign first`);
    }
    item.decision = decision;
    item.decidedAt = this._clock.now();
    return item;
  }

  private _require(campaignId: string): ReviewCampaign {
    const c = this._campaigns.get(campaignId);
    if (!c) throw new Error(`Unknown campaign: ${campaignId}`);
    return c;
  }

  private _requireItems(campaignId: string): ReviewItem[] {
    this._require(campaignId);
    return this._items.get(campaignId)!;
  }

  private _requireItem(campaignId: string, itemId: string): ReviewItem {
    const item = this._requireItems(campaignId).find((i) => i.id === itemId);
    if (!item) throw new Error(`Unknown item: ${itemId}`);
    return item;
  }
}
