/**
 * Onboarding Engine2 — Re-engagement Campaigns
 *
 * ReminderScheduler fires generic "you left off" reminders. Campaigns are
 * the next step up: TARGETED outreach to users stuck at a specific step,
 * with per-step messaging, cadence, suppression and attribution.
 *
 * Model:
 *   - A `Campaign` binds a flow + a target step (or 'any') + a message
 *     template and a touch cadence (e.g. +1d, +7d, +30d of being stuck).
 *   - `evaluate(runs)` scans live runs, finds those whose CURRENT step
 *     matches the target and whose lastActiveAt is older than the next
 *     touch, and emits `CampaignTouch` records.
 *   - Touches are deduplicated by (runId, touchIndex): a run re-evaluated
 *     never re-receives a touch already sent.
 *   - Suppression: `suppress(userId, until)` blocks a user across ALL
 *     campaigns (unsubscribe); `state='completed'|'abandoned'` runs are
 *     never touched.
 *   - `attribute(runId)` records that a touched user came back — the
 *     per-campaign win-back rate is reported by `stats()`.
 *
 * Complexity: O(runs × campaigns) per evaluate — both are small in
 * practice; the dedup index keeps repeated scans O(1) per run.
 *
 * @module OnboardingLayer/Engine2
 */

import { Clock, FlowRun, StepId, SystemClock } from '../flow/FlowTypes';

export interface Campaign {
  readonly campaignId: string;
  readonly flowId: string;
  /** Stuck-at step to target; 'any' matches whatever step is active. */
  readonly targetStep: StepId | 'any';
  /** Idle thresholds (ms since lastActiveAt) for each successive touch. */
  readonly cadenceMs: readonly number[];
  /** Template with {userId} {stepId} {flowId} placeholders. */
  readonly template: string;
}

export interface CampaignTouch {
  readonly campaignId: string;
  readonly runId: string;
  readonly userId: string;
  readonly stepId: StepId;
  /** 0-based cadence index that fired. */
  readonly touchIndex: number;
  readonly sendAt: number;
  readonly message: string;
}

export interface CampaignStats {
  readonly campaignId: string;
  readonly touchesSent: number;
  readonly usersTouched: number;
  readonly usersReturned: number;
  /** usersReturned / usersTouched (0 when none). */
  readonly winBackRate: number;
}

export interface ReengagementOptions {
  readonly clock?: Clock;
}

export class ReengagementCampaigns {
  private readonly _clock: Clock;
  private readonly _campaigns = new Map<string, Campaign>();
  /** `${campaignId}:${runId}` → highest touch index sent. */
  private readonly _sent = new Map<string, number>();
  /** campaignId → set of userIds that returned after a touch. */
  private readonly _returned = new Map<string, Set<string>>();
  /** userId → suppress-until epoch ms. */
  private readonly _suppressed = new Map<string, number>();
  private readonly _touches: CampaignTouch[] = [];

  constructor(options?: ReengagementOptions) {
    this._clock = options?.clock ?? new SystemClock();
  }

  register(campaign: Campaign): void {
    if (campaign.cadenceMs.length === 0) {
      throw new Error(`campaign '${campaign.campaignId}' needs ≥1 cadence step`);
    }
    const sorted = [...campaign.cadenceMs].sort((a, b) => a - b);
    if (sorted.some((v, i) => i > 0 && v <= sorted[i - 1])) {
      throw new Error('cadence must be strictly increasing');
    }
    this._campaigns.set(campaign.campaignId, { ...campaign, cadenceMs: sorted });
  }

  /** Block a user from all campaign touches until `until` (epoch ms). */
  suppress(userId: string, until: number): void {
    this._suppressed.set(userId, until);
  }

  isSuppressed(userId: string): boolean {
    const until = this._suppressed.get(userId);
    return until !== undefined && until > this._clock.now();
  }

  /**
   * A touched user re-engaged (run advanced or a tracking hook fired).
   * Idempotent: one user counts once per campaign.
   */
  attribute(campaignId: string, userId: string): void {
    let set = this._returned.get(campaignId);
    if (!set) {
      set = new Set();
      this._returned.set(campaignId, set);
    }
    set.add(userId);
  }

  /**
   * Scan live runs; emit due touches. Returns only NEWLY created touches
   * this scan — persisted touches are queryable via `touches()`.
   */
  evaluate(runs: readonly FlowRun[]): CampaignTouch[] {
    const now = this._clock.now();
    const fresh: CampaignTouch[] = [];

    for (const run of runs) {
      if (run.state !== 'in-progress') continue;
      if (this.isSuppressed(run.userId)) continue;
      const idleFor = now - run.lastActiveAt;
      const currentStep = run.stepOrder[run.cursor];
      if (currentStep === undefined) continue;

      for (const c of this._campaigns.values()) {
        if (c.flowId !== run.flowId) continue;
        if (c.targetStep !== 'any' && c.targetStep !== currentStep) continue;

        const key = `${c.campaignId}:${run.runId}`;
        const sentUpTo = this._sent.get(key) ?? -1;
        // Fire the HIGHEST cadence step now due — a run idle 40 days on a
        // [1d,7d,30d] cadence gets touch #2, not a replay of all three.
        let idx = sentUpTo;
        for (let i = sentUpTo + 1; i < c.cadenceMs.length; i++) {
          if (idleFor >= c.cadenceMs[i]) idx = i;
        }
        if (idx === sentUpTo) continue;

        const touch: CampaignTouch = {
          campaignId: c.campaignId,
          runId: run.runId,
          userId: run.userId,
          stepId: currentStep,
          touchIndex: idx,
          sendAt: now,
          message: render(c.template, {
            userId: run.userId,
            stepId: currentStep,
            flowId: run.flowId,
          }),
        };
        this._sent.set(key, idx);
        this._touches.push(touch);
        fresh.push(touch);
      }
    }
    return fresh;
  }

  touches(): readonly CampaignTouch[] {
    return this._touches;
  }

  stats(campaignId: string): CampaignStats {
    const ts = this._touches.filter((t) => t.campaignId === campaignId);
    const users = new Set(ts.map((t) => t.userId));
    const returned = this._returned.get(campaignId)?.size ?? 0;
    return {
      campaignId,
      touchesSent: ts.length,
      usersTouched: users.size,
      usersReturned: returned,
      winBackRate: users.size === 0 ? 0 : returned / users.size,
    };
  }
}

/** Minimal {placeholder} interpolation — no eval, no nested logic. */
function render(template: string, vars: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}
