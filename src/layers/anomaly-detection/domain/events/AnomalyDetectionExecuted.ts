/**
 * AnomalyDetectionExecuted Event
 *
 * Raised when anomaly-detection execution completes.
 */

export interface AnomalyDetectionExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class AnomalyDetectionExecuted {
  readonly payload: AnomalyDetectionExecutedPayload;
  readonly eventName: string;

  constructor(payload: AnomalyDetectionExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'anomaly-detection.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): AnomalyDetectionExecuted {
    return new AnomalyDetectionExecuted({
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

  toObject(): AnomalyDetectionExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
