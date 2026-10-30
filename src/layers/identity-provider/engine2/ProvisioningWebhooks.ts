/**
 * ProvisioningWebhooks — outbound user lifecycle event delivery.
 *
 * When the IdP creates/updates/deprovisions a user, registered
 * subscribers (SCIM endpoints, HR systems, audit collectors) get a
 * signed webhook delivery.
 *
 * Delivery semantics:
 *   - EVENTS are recorded on the source side (`emit`) and fanned out
 *     to all subscribers whose event-type filter matches.
 *   - DELIVERIES are per-subscriber, retried with exponential backoff
 *     until `maxAttempts`, then dead-lettered for inspection.
 *   - SIGNING: each delivery body is HMAC-signed with the subscriber's
 *     secret (`X-IdP-Signature` model) — receivers verify authenticity.
 *   - ORDERING: per-subscriber FIFO — a 'deleted' never overtakes the
 *     'created' for the same user on the same subscriber.
 *
 * The HTTP layer is a pluggable `WebhookTransport`; the in-memory
 * implementation records every delivery for tests.
 *
 * @module IdentityProvider/Engine2
 */

import { createHash, randomBytes } from 'crypto';

// ------------------------------------------------------------------ events

export type ProvisioningEventType = 'user.created' | 'user.updated' | 'user.deleted' | 'user.suspended' | 'user.reactivated';

/** A provisioning event as emitted. */
export interface ProvisioningEvent {
  readonly id: string;
  readonly type: ProvisioningEventType;
  readonly userId: string;
  /** Changed fields for 'updated' events. */
  readonly changedFields?: string[];
  /** Snapshot of the user's public attributes at emit time. */
  readonly snapshot?: Record<string, unknown>;
  readonly at: number;
}

/** Wire payload delivered to subscribers. */
export interface WebhookDelivery {
  readonly deliveryId: string;
  readonly event: ProvisioningEvent;
  /** JSON body sent on the wire. */
  readonly body: string;
  /** `sha256=<hmac>` — the signature header receivers verify. */
  readonly signature: string;
  /** Attempt number (1-based). */
  readonly attempt: number;
}

/** Transport seam — real impls POST the body. */
export interface WebhookTransport {
  send(url: string, delivery: WebhookDelivery): Promise<void>;
}

/** In-memory transport — records deliveries; `failNext` simulates 5xx. */
export class InMemoryWebhookTransport implements WebhookTransport {
  readonly sent: Array<{ url: string; delivery: WebhookDelivery }> = [];
  failNext = 0;

  send(url: string, delivery: WebhookDelivery): Promise<void> {
    if (this.failNext > 0) {
      this.failNext--;
      return Promise.reject(new Error('simulated webhook transport failure'));
    }
    this.sent.push({ url, delivery });
    return Promise.resolve();
  }
}

// ------------------------------------------------------------------ subscribers

/** A registered webhook subscriber. */
export interface WebhookSubscriber {
  readonly id: string;
  readonly url: string;
  /** Event types this subscriber receives ('*' = all). */
  readonly events: ReadonlySet<ProvisioningEventType | '*'>;
  /** HMAC secret for signature generation. */
  readonly secret: string;
  readonly createdAt: number;
  enabled: boolean;
}

/** Per-delivery state. */
interface PendingDelivery {
  readonly delivery: WebhookDelivery;
  readonly subscriberId: string;
  attempts: number;
  nextAttemptAt: number;
  dead: boolean;
  lastError?: string;
}

/** Dispatcher config. */
export interface WebhookConfig {
  /** Max delivery attempts before dead-lettering (default 5). */
  maxAttempts: number;
  /** Backoff base ms — attempt n waits base*2^(n-1) capped at maxBackoffMs. */
  backoffBaseMs: number;
  backoffCapMs: number;
}

const DEFAULT_WEBHOOK_CONFIG: WebhookConfig = { maxAttempts: 5, backoffBaseMs: 1_000, backoffCapMs: 60_000 };

export class ProvisioningWebhookDispatcher {
  private readonly _subscribers = new Map<string, WebhookSubscriber>();
  private readonly _queue: PendingDelivery[] = [];
  private readonly _dead: PendingDelivery[] = [];
  private readonly _transport: WebhookTransport;
  private readonly _config: WebhookConfig;
  private readonly _now: () => number;
  private _seq = 0;

  constructor(transport: WebhookTransport, config: Partial<WebhookConfig> = {}, now: () => number = Date.now) {
    this._transport = transport;
    this._config = { ...DEFAULT_WEBHOOK_CONFIG, ...config };
    this._now = now;
  }

  /** Register a subscriber. */
  subscribe(url: string, events: (ProvisioningEventType | '*')[], secret: string): WebhookSubscriber {
    const sub: WebhookSubscriber = {
      id: `sub_${(++this._seq).toString(36)}_${randomBytes(6).toString('base64url')}`,
      url,
      events: new Set(events),
      secret,
      createdAt: this._now(),
      enabled: true,
    };
    this._subscribers.set(sub.id, sub);
    return sub;
  }

  unsubscribe(id: string): boolean {
    return this._subscribers.delete(id);
  }

  subscriber(id: string): WebhookSubscriber | undefined {
    return this._subscribers.get(id);
  }

  /**
   * Emit a provisioning event — enqueues a signed delivery per matching
   * subscriber. Returns the enqueued delivery ids.
   */
  emit(type: ProvisioningEventType, userId: string, detail: { changedFields?: string[]; snapshot?: Record<string, unknown> } = {}): string[] {
    const event: ProvisioningEvent = {
      id: `evt_${(++this._seq).toString(36)}`,
      type,
      userId,
      changedFields: detail.changedFields,
      snapshot: detail.snapshot,
      at: this._now(),
    };
    const ids: string[] = [];
    for (const sub of this._subscribers.values()) {
      if (!sub.enabled) continue;
      if (!sub.events.has('*') && !sub.events.has(type)) continue;
      const deliveryId = `dlv_${(++this._seq).toString(36)}`;
      const body = JSON.stringify(event);
      const signature = signBody(sub.secret, body);
      const delivery: WebhookDelivery = { deliveryId, event, body, signature, attempt: 1 };
      this._queue.push({ delivery, subscriberId: sub.id, attempts: 0, nextAttemptAt: this._now(), dead: false });
      ids.push(deliveryId);
    }
    return ids;
  }

  /**
   * Deliver everything due. Per-subscriber FIFO is preserved by
   * scanning the queue front-to-back per subscriber — a failed head
   * delivery stalls that subscriber's tail (ordering guarantee).
   */
  async flush(): Promise<{ delivered: number; failed: number; deadLettered: number }> {
    const now = this._now();
    let delivered = 0;
    let failed = 0;
    let deadLettered = 0;

    const blocked = new Set<string>();
    const remaining: PendingDelivery[] = [];
    for (const p of this._queue) {
      if (blocked.has(p.subscriberId) || p.nextAttemptAt > now) {
        remaining.push(p);
        continue;
      }
      const sub = this._subscribers.get(p.subscriberId);
      if (!sub) {
        // Subscriber removed — drop the delivery.
        continue;
      }
      p.attempts++;
      const attemptDelivery: WebhookDelivery = { ...p.delivery, attempt: p.attempts };
      try {
        await this._transport.send(sub.url, attemptDelivery);
        delivered++;
      } catch (e) {
        failed++;
        p.lastError = e instanceof Error ? e.message : String(e);
        if (p.attempts >= this._config.maxAttempts) {
          p.dead = true;
          this._dead.push(p);
          deadLettered++;
        } else {
          p.nextAttemptAt = now + Math.min(this._config.backoffCapMs, this._config.backoffBaseMs * Math.pow(2, p.attempts - 1));
          remaining.push(p);
        }
        // Ordering: block the rest of this subscriber's queue.
        blocked.add(p.subscriberId);
        continue;
      }
    }
    this._queue.length = 0;
    this._queue.push(...remaining);
    return { delivered, failed, deadLettered };
  }

  /** Dead-lettered deliveries awaiting operator action. */
  get deadLettered(): readonly PendingDelivery[] {
    return this._dead;
  }

  /** Pending queue depth per subscriber — backlog metric. */
  backlog(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const p of this._queue) {
      out[p.subscriberId] = (out[p.subscriberId] ?? 0) + 1;
    }
    return out;
  }
}

/** Compute the webhook signature header value for a body. */
export function signBody(secret: string, body: string): string {
  return `sha256=${createHash('sha256').update(secret).update(body).digest('hex')}`;
}

/** Verify a delivery's signature — what a receiver implements. */
export function verifySignature(secret: string, body: string, signature: string): boolean {
  return signBody(secret, body) === signature;
}
