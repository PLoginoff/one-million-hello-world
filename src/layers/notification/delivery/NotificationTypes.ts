/**
 * NotificationRequest Delivery Types
 *
 * Core types for the delivery engine: channels, messages, templates,
 * user preferences, delivery records, and digest batches.
 *
 * @module NotificationLayer/Delivery
 */

/** Supported delivery channels. */
export type Channel = 'email' | 'sms' | 'push' | 'webhook';

/** A notification to deliver. */
export interface NotificationRequest {
  /** Recipient user id. */
  readonly userId: string;
  /** Topic, e.g. "billing", "security", "mentions" — used for preferences. */
  readonly topic: string;
  /** Template key to render. */
  readonly template: string;
  /** Template variables (escaped by the renderer). */
  readonly vars: Readonly<Record<string, unknown>>;
  /** Optional explicit channel; when null preferences decide. */
  readonly channel?: Channel;
  /** Optional idempotency key; without one a content hash is used. */
  readonly dedupKey?: string;
  /** Higher priority jumps retry and batch queues. */
  readonly priority?: number;
  readonly occurredAt?: number;
}

/** Rendered, channel-bound payload. */
export interface OutboundMessage {
  readonly notificationId: string;
  readonly userId: string;
  readonly channel: Channel;
  readonly subject: string;
  readonly body: string;
  /** Provider target (email address, phone, webhook URL, device token). */
  readonly target: string;
  readonly dedupHash: string;
}

/** Result a channel adapter returns after dispatch. */
export interface SendResult {
  readonly ok: boolean;
  /** Provider-assigned message id for callback reconciliation. */
  readonly providerId?: string;
  /** Machine-readable failure reason when !ok. */
  readonly error?: string;
  /** Hint for retry: provider says retryable (429, 5xx) or not (4xx). */
  readonly retryable?: boolean;
}

/** Channel adapter interface — stub out real providers in tests. */
export interface ChannelAdapter {
  readonly channel: Channel;
  send(message: OutboundMessage): Promise<SendResult>;
}

/** A resolved preference for (user, topic, channel). */
export type PreferenceRule =
  | { readonly effect: 'allow' }
  | { readonly effect: 'deny' }
  | { readonly effect: 'digest'; readonly every: number };

/** User-level preference matrix row. */
export interface PreferenceEntry {
  readonly userId: string;
  readonly topic: string;
  readonly channel: Channel;
  readonly rule: PreferenceRule;
}

/** Quiet hours: suppress non-urgent sends inside [startHour, endHour) UTC. */
export interface QuietHours {
  readonly userId: string;
  /** Inclusive start, 0–23. */
  readonly startHour: number;
  /** Exclusive end, 0–23. Wraps midnight if start > end. */
  readonly endHour: number;
}

/** Delivery lifecycle states. */
export type DeliveryState =
  | 'queued'
  | 'rendered'
  | 'sent'
  | 'delivered'     // provider callback confirmed
  | 'failed'        // non-retryable failure
  | 'bounced'       // provider callback: hard bounce
  | 'deferred'      // retry scheduled
  | 'suppressed'    // denied by preferences / quiet hours
  | 'digested';     // folded into a batch summary

/** One tracked delivery attempt. */
export interface DeliveryRecord {
  readonly notificationId: string;
  readonly userId: string;
  readonly channel: Channel;
  state: DeliveryState;
  /** Dispatch attempts so far. */
  attempts: number;
  /** Next scheduled retry (epoch ms) or null. */
  nextAttemptAt: number | null;
  /** Provider-assigned id once sent. */
  providerId?: string;
  readonly history: { at: number; from: DeliveryState; to: DeliveryState; note?: string }[];
}

/** A digest grouping many notifications into one summary send. */
export interface Digest {
  readonly userId: string;
  readonly channel: Channel;
  readonly topic: string;
  readonly items: readonly NotificationRequest[];
  readonly windowStart: number;
  readonly windowEnd: number;
}

/** Per-channel retry/backoff profile. */
export interface ChannelBackoff {
  readonly channel: Channel;
  /** Base delay ms; attempt n waits `baseMs * factor^n` (capped). */
  readonly baseMs: number;
  readonly factor: number;
  readonly maxMs: number;
  readonly maxAttempts: number;
}

export const DEFAULT_BACKOFFS: Readonly<Record<Channel, ChannelBackoff>> = {
  email:   { channel: 'email',   baseMs: 60_000,  factor: 2, maxMs: 3_600_000, maxAttempts: 5 },
  sms:     { channel: 'sms',     baseMs: 30_000,  factor: 3, maxMs: 1_800_000, maxAttempts: 4 },
  push:    { channel: 'push',    baseMs: 15_000,  factor: 2, maxMs:   600_000, maxAttempts: 6 },
  webhook: { channel: 'webhook', baseMs: 5_000,   factor: 4, maxMs:   300_000, maxAttempts: 8 },
};

/** Injectable clock. */
export interface Clock {
  now(): number;
}

export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
}

export class DeliveryError extends Error {
  constructor(
    public readonly code:
      | 'NO_CHANNEL'
      | 'RENDER_FAILED'
      | 'NO_ADAPTER'
      | 'TEMPLATE_NOT_FOUND'
      | 'INVALID_NOTIFICATION',
    message: string
  ) {
    super(message);
    this.name = 'DeliveryError';
  }
}
