/**
 * AnomalyDetectionFailed Event
 *
 * Raised when anomaly-detection execution fails.
 */

export interface AnomalyDetectionFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class AnomalyDetectionFailed {
  readonly payload: AnomalyDetectionFailedPayload;
  readonly eventName: string;

  constructor(payload: AnomalyDetectionFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'anomaly-detection.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): AnomalyDetectionFailed {
    return new AnomalyDetectionFailed({
      layerName: 'anomaly-detection',
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

  toObject(): AnomalyDetectionFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
