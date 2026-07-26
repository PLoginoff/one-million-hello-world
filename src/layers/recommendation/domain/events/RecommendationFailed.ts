/**
 * RecommendationFailed Event
 *
 * Raised when recommendation execution fails.
 */

export interface RecommendationFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class RecommendationFailed {
  readonly payload: RecommendationFailedPayload;
  readonly eventName: string;

  constructor(payload: RecommendationFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'recommendation.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): RecommendationFailed {
    return new RecommendationFailed({
      layerName: 'recommendation',
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

  toObject(): RecommendationFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
