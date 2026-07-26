/**
 * OutboxFailed Event
 *
 * Raised when outbox execution fails.
 */

export interface OutboxFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class OutboxFailed {
  readonly payload: OutboxFailedPayload;
  readonly eventName: string;

  constructor(payload: OutboxFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'outbox.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): OutboxFailed {
    return new OutboxFailed({
      layerName: 'outbox',
      executionId: executionId,
      timestamp: Date.now(),
      durationMs: durationMs,
      success: success,
      metadata: metadata,
    });
  }

  getAge(): number {
    return Date.now() - this.payload.timestamp;
  }

  toObject(): OutboxFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
