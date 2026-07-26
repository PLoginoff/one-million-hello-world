/**
 * RetryExecuted Event
 *
 * Raised when retry execution completes.
 */

export interface RetryExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class RetryExecuted {
  readonly payload: RetryExecutedPayload;
  readonly eventName: string;

  constructor(payload: RetryExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'retry.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): RetryExecuted {
    return new RetryExecuted({
      layerName: 'retry',
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

  toObject(): RetryExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
