/**
 * FraudDetectionFailed Event
 *
 * Raised when fraud-detection execution fails.
 */

export interface FraudDetectionFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class FraudDetectionFailed {
  readonly payload: FraudDetectionFailedPayload;
  readonly eventName: string;

  constructor(payload: FraudDetectionFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'fraud-detection.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): FraudDetectionFailed {
    return new FraudDetectionFailed({
      layerName: 'fraud-detection',
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

  toObject(): FraudDetectionFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
