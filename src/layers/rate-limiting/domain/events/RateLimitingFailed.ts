/**
 * RateLimitingFailed Event
 *
 * Raised when rate-limiting execution fails.
 */

export interface RateLimitingFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class RateLimitingFailed {
  readonly payload: RateLimitingFailedPayload;
  readonly eventName: string;

  constructor(payload: RateLimitingFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'rate-limiting.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): RateLimitingFailed {
    return new RateLimitingFailed({
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

  toObject(): RateLimitingFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
