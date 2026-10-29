/**
 * Preference Store
 *
 * Resolves whether (and how) a notification reaches a user on each channel:
 * an explicit channel × topic matrix plus quiet hours.
 *
 * Resolution order (most specific wins):
 *   1. exact (userId, topic, channel) entry
 *   2. wildcard topic ('*') entry for (userId, channel)
 *   3. channel default (allow)
 *
 * Quiet hours downgrade 'allow' → defer (re-queue for after the window)
 * unless the topic is marked urgent.
 *
 * @module NotificationLayer/Delivery
 */

import {
  Channel,
  PreferenceEntry,
  PreferenceRule,
  QuietHours,
} from './NotificationTypes';

/** Topics that bypass quiet hours. */
const URGENT_TOPICS = new Set(['security', 'billing-failed', 'alert']);

export type Resolution =
  | { readonly kind: 'allow' }
  | { readonly kind: 'deny' }
  | { readonly kind: 'digest'; readonly every: number }
  | { readonly kind: 'defer'; readonly until: number };

export class PreferenceStore {
  /** "userId|topic|channel" → rule */
  private readonly _rules = new Map<string, PreferenceRule>();
  private readonly _quiet = new Map<string, QuietHours>();

  setPreference(entry: PreferenceEntry): void {
    this._rules.set(ruleKey(entry.userId, entry.topic, entry.channel), entry.rule);
  }

  /** Remove a preference, falling back to default allow. */
  clearPreference(userId: string, topic: string, channel: Channel): void {
    this._rules.delete(ruleKey(userId, topic, channel));
  }

  setQuietHours(q: QuietHours): void {
    this._quiet.set(q.userId, q);
  }

  clearQuietHours(userId: string): void {
    this._quiet.delete(userId);
  }

  /**
   * Resolve the effective rule at time `now` (UTC epoch ms).
   */
  resolve(userId: string, topic: string, channel: Channel, now: number): Resolution {
    const exact = this._rules.get(ruleKey(userId, topic, channel));
    const wild = this._rules.get(ruleKey(userId, '*', channel));
    const rule = exact ?? wild ?? { effect: 'allow' as const };

    if (rule.effect === 'deny') return { kind: 'deny' };
    if (rule.effect === 'digest') return { kind: 'digest', every: rule.every };

    // allow — apply quiet hours unless urgent
    const quiet = this._quiet.get(userId);
    if (quiet && !URGENT_TOPICS.has(topic) && inQuietHours(now, quiet)) {
      return { kind: 'defer', until: quietEnd(now, quiet) };
    }
    return { kind: 'allow' };
  }
}

function ruleKey(userId: string, topic: string, channel: Channel): string {
  return `${userId}|${topic}|${channel}`;
}

/**
 * Whether `now` (UTC ms) falls inside quiet hours. Handles wrap-around
 * windows like 22 → 7.
 */
export function inQuietHours(now: number, q: QuietHours): boolean {
  const hour = new Date(now).getUTCHours();
  if (q.startHour <= q.endHour) {
    return hour >= q.startHour && hour < q.endHour;
  }
  return hour >= q.startHour || hour < q.endHour;
}

/**
 * Compute the UTC timestamp when quiet hours end after `now`. If `now` is
 * inside the window, returns the next `endHour:00` boundary; if outside,
 * returns `now` (caller should not defer).
 */
export function quietEnd(now: number, q: QuietHours): number {
  const d = new Date(now);
  const hour = d.getUTCHours();
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), q.endHour));
  if (q.startHour <= q.endHour) {
    // Same-day window: if hour >= endHour already (shouldn't happen when
    // inside), push to tomorrow.
    if (hour >= q.endHour) end.setUTCDate(end.getUTCDate() + 1);
  } else {
    // Wrap window: end is tomorrow morning if we're in the late-evening part.
    if (hour >= q.startHour) end.setUTCDate(end.getUTCDate() + 1);
    // If hour < endHour we're in the morning part — end is today, already set.
  }
  return end.getTime();
}
