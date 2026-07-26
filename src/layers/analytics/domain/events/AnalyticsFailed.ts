/**
 * AnalyticsFailed Event
 *
 * Raised when analytics execution fails.
 */

export interface AnalyticsFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class AnalyticsFailed {
  readonly payload: AnalyticsFailedPayload;
  readonly eventName: string;

  constructor(payload: AnalyticsFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'analytics.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): AnalyticsFailed {
    return new AnalyticsFailed({
      layerName: 'analytics',
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

  toObject(): AnalyticsFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
