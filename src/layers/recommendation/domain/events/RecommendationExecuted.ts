/**
 * RecommendationExecuted Event
 *
 * Raised when recommendation execution completes.
 */

export interface RecommendationExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class RecommendationExecuted {
  readonly payload: RecommendationExecutedPayload;
  readonly eventName: string;

  constructor(payload: RecommendationExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'recommendation.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): RecommendationExecuted {
    return new RecommendationExecuted({
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

  toObject(): RecommendationExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
