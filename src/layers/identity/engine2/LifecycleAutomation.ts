/**
 * LifecycleAutomation — dormant-account lifecycle policies.
 *
 * The `AccountLifecycle` FSM defines legal transitions; this module
 * automates WHEN they fire as a staged dormancy pipeline:
 *
 *   ACTIVE --(no login for warnAfterMs)--> DORMANT-warned
 *   DORMANT-warned --(no response for suspendAfterMs)--> SUSPENDED
 *   SUSPENDED --(no recovery for deleteAfterMs)--> DELETED
 *
 * Dormancy is measured from `lastActivityAt` — supplied by the caller
 * (session touches, logins) since `User` doesn't track it. Warnings
 * are deduplicated: each user is warned at most once per dormancy
 * episode, keyed by the activity timestamp the warning was based on.
 *
 * Dry-run mode produces the same plan without mutating — the report a
 * compliance reviewer wants before enabling the job for real.
 *
 * @module Identity/Engine2
 */

import { AccountLifecycle } from '../core/AccountLifecycle';
import { AccountStatus } from '../core/types';
import type { User } from '../core/types';
import type { IdentityStore } from '../core/IdentityStore';

// ------------------------------------------------------------------ types

/** Policy thresholds (ms of inactivity). */
export interface DormancyPolicy {
  /** Inactivity before a warning is emitted. */
  warnAfterMs: number;
  /** Inactivity (from warning) before suspension. */
  suspendAfterMs: number;
  /** Inactivity (from suspension) before deletion. */
  deleteAfterMs: number;
  /** Statuses subject to dormancy handling (default ACTIVE+LOCKED). */
  appliesTo: AccountStatus[];
}

export const DEFAULT_DORMANCY_POLICY: DormancyPolicy = {
  warnAfterMs: 90 * 24 * 3600_000, // 90 days
  suspendAfterMs: 30 * 24 * 3600_000, // +30 days after warning
  deleteAfterMs: 365 * 24 * 3600_000, // +1 year after suspension
  appliesTo: [AccountStatus.ACTIVE],
};

/** A planned lifecycle action for one user. */
export interface LifecycleAction {
  readonly userId: string;
  readonly action: 'warn' | 'suspend' | 'delete';
  readonly reason: string;
  readonly inactiveMs: number;
}

/** Sweep report. */
export interface LifecycleSweepReport {
  readonly evaluated: number;
  readonly warned: LifecycleAction[];
  readonly suspended: LifecycleAction[];
  readonly deleted: LifecycleAction[];
  readonly skipped: Array<{ userId: string; reason: string }>;
  readonly dryRun: boolean;
}

/** Warning sink — callers wire this to email/push. */
export type DormancyNotifier = (userId: string, action: LifecycleAction) => void;

// ------------------------------------------------------------------ automation

export class LifecycleAutomation {
  private readonly _store: IdentityStore;
  private readonly _policy: DormancyPolicy;
  private readonly _notifier?: DormancyNotifier;
  private readonly _now: () => number;
  /** userId -> lastActivityAt(ms) — the caller-maintained activity book. */
  private readonly _lastActivity = new Map<string, number>();
  /** userId -> activity timestamp the last warning was based on. */
  private readonly _warnedFor = new Map<string, number>();
  /** userId -> suspension timestamp. */
  private readonly _suspendedAt = new Map<string, number>();

  constructor(
    store: IdentityStore,
    policy: Partial<DormancyPolicy> = {},
    notifier?: DormancyNotifier,
    now: () => number = Date.now,
  ) {
    this._store = store;
    this._policy = { ...DEFAULT_DORMANCY_POLICY, ...policy };
    this._notifier = notifier;
    this._now = now;
  }

  /** Record user activity (login, API call, session touch). */
  touch(userId: string, at?: number): void {
    this._lastActivity.set(userId, at ?? this._now());
    // Activity resets the warning episode — a new dormancy period needs
    // a fresh warning before suspension.
    this._warnedFor.delete(userId);
    this._suspendedAt.delete(userId);
  }

  /** Backfill activity for an existing user. */
  seedActivity(userId: string, at: number): void {
    this._lastActivity.set(userId, at);
  }

  /**
   * Evaluate all users against the policy.
   * `dryRun` produces the plan without transitions/notifications.
   */
  sweep(dryRun = false): LifecycleSweepReport {
    const now = this._now();
    const warned: LifecycleAction[] = [];
    const suspended: LifecycleAction[] = [];
    const deleted: LifecycleAction[] = [];
    const skipped: LifecycleSweepReport['skipped'] = [];
    let evaluated = 0;

    for (const user of this._store.all()) {
      if (!this._policy.appliesTo.includes(user.status) && user.status !== AccountStatus.SUSPENDED) {
        continue; // DELETED / other statuses are out of scope
      }
      evaluated++;
      const last = this._lastActivity.get(user.id) ?? user.updatedAt;
      const inactiveMs = now - last;

      if (user.status === AccountStatus.SUSPENDED) {
        // Deletion stage: suspended users age toward deletion.
        const suspAt = this._suspendedAt.get(user.id) ?? user.updatedAt;
        const sinceSusp = now - suspAt;
        if (sinceSusp >= this._policy.deleteAfterMs) {
          const action: LifecycleAction = {
            userId: user.id,
            action: 'delete',
            reason: `suspended ${Math.floor(sinceSusp / 86_400_000)}d >= ${Math.floor(this._policy.deleteAfterMs / 86_400_000)}d`,
            inactiveMs,
          };
          deleted.push(action);
          if (!dryRun && AccountLifecycle.canTransition(user.status, AccountStatus.DELETED)) {
            AccountLifecycle.transition(user, AccountStatus.DELETED, now);
            this._store.update(user);
          }
        } else {
          skipped.push({ userId: user.id, reason: 'suspended but below delete threshold' });
        }
        continue;
      }

      // Active-scope users: warn → suspend pipeline.
      if (inactiveMs >= this._policy.suspendAfterMs + this._policy.warnAfterMs) {
        const action: LifecycleAction = {
          userId: user.id,
          action: 'suspend',
          reason: `inactive ${Math.floor(inactiveMs / 86_400_000)}d past warn+suspend window`,
          inactiveMs,
        };
        suspended.push(action);
        if (!dryRun && AccountLifecycle.canTransition(user.status, AccountStatus.SUSPENDED)) {
          AccountLifecycle.transition(user, AccountStatus.SUSPENDED, now);
          this._store.update(user);
          this._suspendedAt.set(user.id, now);
        }
      } else if (inactiveMs >= this._policy.warnAfterMs) {
        const warnedFor = this._warnedFor.get(user.id);
        if (warnedFor === last) {
          skipped.push({ userId: user.id, reason: 'already warned for this episode' });
          continue;
        }
        const action: LifecycleAction = {
          userId: user.id,
          action: 'warn',
          reason: `inactive ${Math.floor(inactiveMs / 86_400_000)}d >= ${Math.floor(this._policy.warnAfterMs / 86_400_000)}d`,
          inactiveMs,
        };
        warned.push(action);
        if (!dryRun) {
          this._warnedFor.set(user.id, last);
          this._notifier?.(user.id, action);
        }
      }
    }

    return { evaluated, warned, suspended, deleted, skipped, dryRun };
  }

  /** Milliseconds until a user hits the warn threshold (undefined if past). */
  msUntilWarn(userId: string): number | undefined {
    const last = this._lastActivity.get(userId);
    if (last === undefined) return undefined;
    const remaining = this._policy.warnAfterMs - (this._now() - last);
    return Math.max(0, remaining);
  }
}
