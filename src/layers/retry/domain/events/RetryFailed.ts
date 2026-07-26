/**
 * RetryFailed Event
 *
 * Raised when retry execution fails.
 */

export interface RetryFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class RetryFailed {
  readonly payload: RetryFailedPayload;
  readonly eventName: string;

  constructor(payload: RetryFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'retry.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): RetryFailed {
    return new RetryFailed({
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

  toObject(): RetryFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
