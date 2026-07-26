/**
 * OutboxExecuted Event
 *
 * Raised when outbox execution completes.
 */

export interface OutboxExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class OutboxExecuted {
  readonly payload: OutboxExecutedPayload;
  readonly eventName: string;

  constructor(payload: OutboxExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'outbox.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): OutboxExecuted {
    return new OutboxExecuted({
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

  toObject(): OutboxExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
