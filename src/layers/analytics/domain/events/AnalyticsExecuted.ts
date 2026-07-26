/**
 * AnalyticsExecuted Event
 *
 * Raised when analytics execution completes.
 */

export interface AnalyticsExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class AnalyticsExecuted {
  readonly payload: AnalyticsExecutedPayload;
  readonly eventName: string;

  constructor(payload: AnalyticsExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'analytics.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): AnalyticsExecuted {
    return new AnalyticsExecuted({
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

  toObject(): AnalyticsExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
