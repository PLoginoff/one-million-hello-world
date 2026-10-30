/**
 * Policy Matrix — per-user topic×channel preferences + quiet hours +
 * per-user rate limiting, resolved into a single verdict.
 *
 * Where `delivery/PreferenceStore` resolves a single (topic, channel)
 * preference, the PolicyMatrix layers the concerns that decide *whether
 * to send at all*:
 *
 *   1. critical topic?       → always allow (bypass everything)
 *   2. channel denied?       → deny (don't even consume rate budget)
 *   3. quiet hours?          → defer until quiet end
 *   4. digest preference?    → hand to a batcher
 *   5. over hourly budget?   → rate-limited with retry hint
 *   6. otherwise             → allow (and consume budget)
 *
 * Rate limiting is a sliding-window counter per user: timestamps live
 * in a deque; `check` evicts entries older than 1h, then compares
 * `deque.length` to `maxPerHour`. Amortized O(1) per check.
 *
 * @module NotificationLayer/Engine2
 */

import { Channel, Clock, QuietHours, SystemClock } from '../delivery/NotificationTypes';
import { inQuietHours, quietEnd } from '../delivery/PreferenceStore';
import { ChannelPref, PolicyVerdict, UserPolicy } from './types';

const HOUR_MS = 3_600_000;
const DEFAULT_MAX_PER_HOUR = 60;
const DEFAULT_DIGEST_EVERY_MS = 60 * 60_000;

export class PolicyMatrix {
  private readonly _clock: Clock;
  private readonly _policies = new Map<string, UserPolicy>();
  /** userId → deque of sent-timestamps (sliding 1h window). */
  private readonly _sentLog = new Map<string, number[]>();
  private _logHead = new Map<string, number>();

  constructor(clock: Clock = new SystemClock()) {
    this._clock = clock;
  }

  setPolicy(policy: UserPolicy): void {
    this._policies.set(policy.userId, policy);
  }

  removePolicy(userId: string): void {
    this._policies.delete(userId);
    this._sentLog.delete(userId);
    this._logHead.delete(userId);
  }

  /**
   * Resolve a (user, topic, channel) request to a verdict.
   * `priority` ≥ 10 punches through quiet hours but NOT deny or rate
   * limits — an escalation the user asked for, not a spam override.
   */
  resolve(userId: string, topic: string, channel: Channel, priority = 0): PolicyVerdict {
    const policy = this._policies.get(userId);
    const critical = policy?.criticalTopics?.includes(topic) ?? false;
    if (critical) return { kind: 'allow' };

    const pref = this._channelPref(policy, topic, channel);
    if (pref === 'deny' || pref === 'quiet') {
      // 'deny' = hard block; 'quiet' = named mute (never this channel).
      return { kind: 'deny', reason: `user ${pref} ${topic} on ${channel}` };
    }
    if (pref === 'digest') {
      return {
        kind: 'digest',
        everyMs: policy?.digestEveryMs ?? DEFAULT_DIGEST_EVERY_MS,
      };
    }

    const now = this._clock.now();
    const quiet = policy?.quietHours;
    if (quiet && priority < 10 && inQuietHours(now, quiet)) {
      return { kind: 'defer', untilMs: quietEnd(now, quiet), reason: 'quiet-hours' };
    }

    const max = policy?.maxPerHour ?? DEFAULT_MAX_PER_HOUR;
    if (max > 0) {
      const head = this._evictOld(userId, now);
      const count = (this._sentLog.get(userId)?.length ?? 0) - head;
      if (count >= max) {
        const oldest = this._sentLog.get(userId)?.[head];
        const retryAfter = oldest !== undefined ? oldest + HOUR_MS - now : HOUR_MS;
        return { kind: 'rate-limited', retryAfterMs: Math.max(retryAfter, 1) };
      }
      this._sentLog.get(userId)?.push(now);
    }
    return { kind: 'allow' };
  }

  /** How many sends the user has left this hour. */
  remainingBudget(userId: string): number {
    const policy = this._policies.get(userId);
    const max = policy?.maxPerHour ?? DEFAULT_MAX_PER_HOUR;
    if (max <= 0) return Infinity;
    const now = this._clock.now();
    const head = this._evictOld(userId, now);
    const used = (this._sentLog.get(userId)?.length ?? 0) - head;
    return Math.max(max - used, 0);
  }

  /** Look up the effective preference for (topic, channel). */
  private _channelPref(policy: UserPolicy | undefined, topic: string, channel: Channel): ChannelPref {
    const topicRow = policy?.topicPrefs[topic];
    if (topicRow?.[channel] !== undefined) return topicRow[channel];
    if (policy?.defaultPrefs?.[channel] !== undefined) return policy.defaultPrefs[channel];
    return 'allow';
  }

  /** Pop sent-timestamps older than 1h off the deque head. */
  private _evictOld(userId: string, now: number): number {
    let log = this._sentLog.get(userId);
    if (!log) {
      log = [];
      this._sentLog.set(userId, log);
      this._logHead.set(userId, 0);
    }
    let head = this._logHead.get(userId) ?? 0;
    const edge = now - HOUR_MS;
    while (head < log.length && log[head] < edge) head += 1;
    // Compact when the dead prefix dominates.
    if (head > 256 && head * 2 > log.length) {
      log.splice(0, head);
      head = 0;
    }
    this._logHead.set(userId, head);
    return head;
  }
}
