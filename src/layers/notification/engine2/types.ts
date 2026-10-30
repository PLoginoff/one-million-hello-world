/**
 * Notification Engine 2 — shared types
 *
 * `delivery/` is the transport path (adapters, dedup, tracker, retry on
 * the *same* channel). `engine2/` is the *policy* layer that decides
 * whether/where a notification should go at all:
 *
 *   PolicyMatrix    — per-user topic×channel rules + quiet hours +
 *                     per-user rate limiting, one resolution answer
 *   EscalationChain — ordered channel fallback on failure or no-pref
 *   TemplateTree    — base/child template inheritance for per-channel
 *                     or per-tenant rendering variants
 *
 * Reuses `delivery/` primitives (Channel, QuietHours, Clock) so the two
 * layers compose rather than compete.
 *
 * @module NotificationLayer/Engine2
 */

import type {
  Channel,
  Clock,
  QuietHours,
} from '../delivery/NotificationTypes';

export type { Channel, Clock, QuietHours };

// ---------------------------------------------------------------------------
// Preference matrix + policy resolution
// ---------------------------------------------------------------------------

/** What a user wants for one topic on one channel. */
export type ChannelPref = 'allow' | 'deny' | 'digest' | 'quiet';

/** A user's notification policy. */
export interface UserPolicy {
  readonly userId: string;
  /** topic → channel → preference. Missing = default. */
  readonly topicPrefs: Readonly<Record<string, Partial<Record<Channel, ChannelPref>>>>;
  /** Fallback topic row when the topic isn't listed. */
  readonly defaultPrefs?: Partial<Record<Channel, ChannelPref>>;
  /** Quiet hours — all non-critical channels pause inside. */
  readonly quietHours?: QuietHours;
  /** Topics that punch through quiet hours + rate limits. */
  readonly criticalTopics?: ReadonlyArray<string>;
  /** Max notifications per rolling hour (0 = unlimited). */
  readonly maxPerHour?: number;
  /** Digest interval when a channel pref is 'digest'. */
  readonly digestEveryMs?: number;
}

export type PolicyVerdict =
  | { kind: 'allow' }
  | { kind: 'deny'; reason: string }
  | { kind: 'defer'; untilMs: number; reason: string }
  | { kind: 'digest'; everyMs: number }
  | { kind: 'rate-limited'; retryAfterMs: number };

// ---------------------------------------------------------------------------
// Escalation chain
// ---------------------------------------------------------------------------

/** One step in a channel fallback chain. */
export interface ChainStep {
  readonly channel: Channel;
  /** Wait this long after a failed attempt before the next channel. */
  readonly afterFailureDelayMs: number;
  /** Give up on this channel after this many attempts. */
  readonly maxAttempts: number;
}

export interface EscalationPlan {
  readonly name: string;
  readonly steps: ReadonlyArray<ChainStep>;
}

/** Where an individual notification sits in its chain. */
export interface ChainState {
  readonly planName: string;
  readonly stepIndex: number;
  readonly attemptOnStep: number;
  readonly exhausted: boolean;
  readonly nextChannel?: Channel;
  readonly nextAttemptAtMs?: number;
}

// ---------------------------------------------------------------------------
// Template inheritance
// ---------------------------------------------------------------------------

/** A renderable template fragment (subject + body, both may be absent). */
export interface TemplateFragment {
  readonly subject?: string;
  readonly body?: string;
}

/**
 * A template node in an inheritance chain. Children override whichever
 * fields they declare; unset fields fall through to the parent.
 */
export interface TemplateNode {
  readonly key: string;
  readonly parentKey?: string;
  readonly fragment: TemplateFragment;
}

export interface RenderedTemplate {
  readonly subject: string;
  readonly body: string;
  /** Chain of template keys that composed this render, root-first. */
  readonly lineage: ReadonlyArray<string>;
}
