/**
 * FraudDetectionExecuted Event
 *
 * Raised when fraud-detection execution completes.
 */

export interface FraudDetectionExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class FraudDetectionExecuted {
  readonly payload: FraudDetectionExecutedPayload;
  readonly eventName: string;

  constructor(payload: FraudDetectionExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'fraud-detection.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): FraudDetectionExecuted {
    return new FraudDetectionExecuted({
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

  toObject(): FraudDetectionExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
