/**
 * Channel Adapters
 *
 * In-memory stub adapters for email, SMS, push, and webhook channels.
 * Each adapter records every dispatched message so tests and the reconciler
 * can inspect what "left the building", and supports scripted failures so
 * retry paths are exercised deterministically.
 *
 * A real deployment would subclass these and replace `_deliver` with a
 * provider SDK call — the orchestration never touches adapters directly.
 *
 * @module NotificationLayer/Delivery
 */

import {
  Channel,
  ChannelAdapter,
  OutboundMessage,
  SendResult,
} from './NotificationTypes';

/** Scriptable failure injected for testing retries. */
export interface ScriptedFailure {
  /** Return an error for the Nth call (1-based). */
  readonly failOnAttempts?: readonly number[];
  readonly error?: string;
  readonly retryable?: boolean;
}

/**
 * Base adapter with a send-log and failure scripting. Subclasses only set
 * `channel` and may override `_deliver` for provider-specific shaping.
 */
export abstract class StubAdapter implements ChannelAdapter {
  abstract readonly channel: Channel;

  /** Every message that reached `send()`, in order. */
  readonly sent: OutboundMessage[] = [];

  private _failScript: ScriptedFailure | null = null;
  private _callCount = 0;
  private _providerSeq = 0;

  /** Script a failure pattern for subsequent sends. */
  scriptFailures(script: ScriptedFailure | null): void {
    this._failScript = script;
    this._callCount = 0;
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    this._callCount++;
    const script = this._failScript;
    if (script?.failOnAttempts?.includes(this._callCount)) {
      return {
        ok: false,
        error: script.error ?? `${this.channel}-error`,
        retryable: script.retryable ?? true,
      };
    }
    this.sent.push(message);
    return this._deliver(message);
  }

  /** Provider call; default mints a provider id. */
  protected async _deliver(_message: OutboundMessage): Promise<SendResult> {
    await Promise.resolve();
    this._providerSeq++;
    return { ok: true, providerId: `${this.channel}-${this._providerSeq}` };
  }
}

export class EmailAdapter extends StubAdapter {
  readonly channel: Channel = 'email';
}

export class SmsAdapter extends StubAdapter {
  readonly channel: Channel = 'sms';
}

export class PushAdapter extends StubAdapter {
  readonly channel: Channel = 'push';
}

/**
 * Webhook adapter: POSTs the rendered body to `message.target`.
 * The stub still just logs — but models the retryable=false semantics of
 * HTTP 4xx responses via `scriptFailures`.
 */
export class WebhookAdapter extends StubAdapter {
  readonly channel: Channel = 'webhook';
}
