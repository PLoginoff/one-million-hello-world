/**
 * RateLimitingExecuted Event
 *
 * Raised when rate-limiting execution completes.
 */

export interface RateLimitingExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class RateLimitingExecuted {
  readonly payload: RateLimitingExecutedPayload;
  readonly eventName: string;

  constructor(payload: RateLimitingExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'rate-limiting.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): RateLimitingExecuted {
    return new RateLimitingExecuted({
      layerName: 'rate-limiting',
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

  toObject(): RateLimitingExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
