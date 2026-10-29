/**
 * Delivery Engine
 *
 * Orchestrates the full notification pipeline:
 *
 *   notify()
 *     → dedup check
 *     → resolve channels (explicit or preferences per-channel)
 *     → preference resolution per channel (allow / deny / digest / defer)
 *     → template render (escaped vars)
 *     → channel adapter dispatch
 *     → delivery record tracking + retry scheduling
 *
 *   flushRetries()   — re-dispatch deferred records whose backoff elapsed
 *   flushDigests()   — fold buffered digest items into one summary send
 *   reconcile()      — apply provider delivery callbacks
 *
 * @module NotificationLayer/Delivery
 */

import {
  Channel,
  ChannelAdapter,
  ChannelBackoff,
  Clock,
  DEFAULT_BACKOFFS,
  DeliveryError,
  Digest,
  NotificationRequest,
  OutboundMessage,
  SystemClock,
} from './NotificationTypes';
import { TemplateEngine } from './TemplateEngine';
import { PreferenceStore } from './PreferenceStore';
import { DedupStore, dedupHash } from './DedupStore';
import { DigestBatcher } from './DigestBatcher';
import { DeliveryTracker, ProviderCallback } from './DeliveryTracker';

/** Where to send — a user may resolve per-channel targets (email addr, phone…). */
export type TargetResolver = (userId: string, channel: Channel) => string;

export class DeliveryEngine {
  readonly templates = new TemplateEngine();
  readonly preferences = new PreferenceStore();
  readonly tracker: DeliveryTracker;
  readonly dedup: DedupStore;
  readonly digester: DigestBatcher;

  private readonly _adapters = new Map<Channel, ChannelAdapter>();
  private readonly _backoffs: Readonly<Record<Channel, ChannelBackoff>>;
  private _seq = 0;
  /** notificationId → { notification, channel } for retries/digests. */
  private readonly _inflight = new Map<string, { n: NotificationRequest; channel: Channel }>();
  /** Pending deferred messages to re-render on retry. */
  private readonly _deferred = new Map<string, { n: NotificationRequest; channel: Channel }>();

  constructor(
    private readonly _resolveTarget: TargetResolver,
    private readonly _clock: Clock = new SystemClock(),
    backoffs: Readonly<Record<Channel, ChannelBackoff>> = DEFAULT_BACKOFFS,
    dedupWindowMs = 5 * 60_000
  ) {
    this._backoffs = backoffs;
    this.tracker = new DeliveryTracker(_clock);
    this.dedup = new DedupStore(dedupWindowMs, _clock);
    this.digester = new DigestBatcher(_clock);
  }

  registerAdapter(adapter: ChannelAdapter): void {
    this._adapters.set(adapter.channel, adapter);
  }

  /**
   * Queue a notification for delivery. Returns the notificationId assigned
   * to the (single) resulting delivery record, or null if fully deduplicated.
   *
   * Multi-channel fan-out: when `notification.channel` is unset, one record
   * is created per channel the preferences allow; the id of the first record
   * is returned and the rest are tracked under suffixed ids.
   */
  async notify(n: NotificationRequest): Promise<string | null> {
    this._validate(n);
    const channels = n.channel ? [n.channel] : (['email', 'sms', 'push', 'webhook'] as Channel[]);
    let firstId: string | null = null;

    for (const channel of channels) {
      const hash = dedupHash(n, channel);
      if (this.dedup.check(hash)) continue; // duplicate within window

      const nid = `n-${++this._seq}`;
      const rec = this.tracker.open(nid, n.userId, channel);
      this._inflight.set(nid, { n, channel });
      if (firstId === null) firstId = nid;

      const res = this.preferences.resolve(n.userId, n.topic, channel, this._clock.now());
      switch (res.kind) {
        case 'deny':
          this.tracker.markSuppressed(nid, `pref-deny:${n.topic}`);
          continue;
        case 'digest': {
          const digest = this.digester.add(n, channel, res.every);
          this.tracker.markDigested(nid);
          if (digest) await this._sendDigest(digest);
          continue;
        }
        case 'defer':
          this.tracker.markDeferred(nid, res.until, 'quiet-hours');
          this._deferred.set(nid, { n, channel });
          continue;
        case 'allow':
          await this._dispatch(nid, n, channel, hash);
          continue;
      }
    }
    return firstId;
  }

  /**
   * Dispatch one rendered message through its channel adapter; update the
   * tracker and schedule retry on retryable failure.
   */
  private async _dispatch(nid: string, n: NotificationRequest, channel: Channel, hash: string): Promise<void> {
    const adapter = this._adapters.get(channel);
    if (!adapter) {
      // Missing adapter is a config gap, not a send error — mark failed and
      // continue fan-out to other channels.
      this.tracker.markFailed(nid, `no-adapter:${channel}`);
      return;
    }
    const rendered = this.templates.render(n.template, n.vars);
    this.tracker.markRendered(nid);
    const msg: OutboundMessage = {
      notificationId: nid,
      userId: n.userId,
      channel,
      subject: rendered.subject,
      body: rendered.body,
      target: this._resolveTarget(n.userId, channel),
      dedupHash: hash,
    };
    const result = await adapter.send(msg);
    const backoff = this._backoffs[channel];

    if (result.ok) {
      this.tracker.markSent(nid, result.providerId, null);
      return;
    }
    const rec = this.tracker.get(nid)!;
    const nextAttempt = rec.attempts + 1;
    if (result.retryable !== false && nextAttempt <= backoff.maxAttempts) {
      const delay = Math.min(backoff.baseMs * Math.pow(backoff.factor, rec.attempts), backoff.maxMs);
      this.tracker.markDeferred(nid, this._clock.now() + delay, result.error);
      // keep in _inflight for retry
    } else {
      this.tracker.markFailed(nid, result.error ?? 'send-failed');
      this._inflight.delete(nid);
    }
  }

  /**
   * Re-dispatch every deferred record whose backoff has elapsed. Quiet-hours
   * deferrals are re-checked through preferences before sending.
   */
  async flushRetries(): Promise<number> {
    const now = this._clock.now();
    let sent = 0;
    for (const rec of this.tracker.dueRetries(now)) {
      const inflight = this._inflight.get(rec.notificationId) ?? this._deferred.get(rec.notificationId);
      if (!inflight) continue;
      const { n, channel } = inflight;
      // Re-check preferences — quiet hours may have expired or been changed.
      const res = this.preferences.resolve(n.userId, n.topic, channel, now);
      if (res.kind === 'deny') {
        this.tracker.markSuppressed(rec.notificationId);
        this._deferred.delete(rec.notificationId);
        continue;
      }
      if (res.kind === 'defer') {
        this.tracker.markDeferred(rec.notificationId, res.until, 'quiet-hours');
        continue;
      }
      // Send again — attempts counter increments inside markSent.
      this._deferred.delete(rec.notificationId);
      await this._dispatch(rec.notificationId, n, channel, dedupHash(n, channel));
      sent++;
    }
    return sent;
  }

  /**
   * Fold all buffered digest buckets into summary notifications and send.
   * Returns the digests sent.
   */
  async flushDigests(): Promise<readonly Digest[]> {
    const digests = this.digester.flush();
    for (const d of digests) await this._sendDigest(d);
    return digests;
  }

  /**
   * Apply a provider callback to reconcile delivery state.
   */
  reconcile(cb: ProviderCallback): void {
    this.tracker.reconcile(cb);
  }

  private async _sendDigest(d: Digest): Promise<void> {
    // Render via the 'digest' template convention; fall back to a default
    // body when not registered so digests never fail hard.
    const vars: Record<string, unknown> = {
      count: d.items.length,
      topic: d.topic,
      items: d.items.map((i) => ({ topic: i.topic, vars: i.vars })),
    };
    const key = `digest:${d.topic}`;
    const templateKey = this.templates.has(key) ? key : 'digest';
    if (!this.templates.has(templateKey)) {
      this.templates.register('digest', {
        subject: '{{count}} new {{topic}} notifications',
        body: 'You have {{count}} new {{topic}} notifications.',
      });
    }
    const nid = `n-${++this._seq}`;
    this.tracker.open(nid, d.userId, d.channel);
    const adapter = this._adapters.get(d.channel);
    if (!adapter) {
      this.tracker.markFailed(nid, `no-adapter:${d.channel}`);
      return;
    }
    const rendered = this.templates.render(templateKey, vars);
    this.tracker.markRendered(nid);
    const msg: OutboundMessage = {
      notificationId: nid,
      userId: d.userId,
      channel: d.channel,
      subject: rendered.subject,
      body: rendered.body,
      target: this._resolveTarget(d.userId, d.channel),
      dedupHash: `digest:${d.userId}:${d.channel}:${d.topic}:${d.windowEnd}`,
    };
    const result = await adapter.send(msg);
    if (result.ok) this.tracker.markSent(nid, result.providerId, null);
    else this.tracker.markFailed(nid, result.error);
  }

  private _validate(n: NotificationRequest): void {
    if (!n.userId) throw new DeliveryError('INVALID_NOTIFICATION', 'userId required');
    if (!n.topic) throw new DeliveryError('INVALID_NOTIFICATION', 'topic required');
    if (!n.template) throw new DeliveryError('INVALID_NOTIFICATION', 'template required');
    if (!this.templates.has(n.template) && !n.template.startsWith('digest')) {
      // Rendering would fail later; surface early.
      throw new DeliveryError('TEMPLATE_NOT_FOUND', `no template '${n.template}'`);
    }
  }
}
