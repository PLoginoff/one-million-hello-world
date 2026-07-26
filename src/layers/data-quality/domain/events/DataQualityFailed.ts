/**
 * DataQualityFailed Event
 *
 * Raised when data-quality execution fails.
 */

export interface DataQualityFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class DataQualityFailed {
  readonly payload: DataQualityFailedPayload;
  readonly eventName: string;

  constructor(payload: DataQualityFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'data-quality.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): DataQualityFailed {
    return new DataQualityFailed({
      layerName: 'data-quality',
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

  toObject(): DataQualityFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
