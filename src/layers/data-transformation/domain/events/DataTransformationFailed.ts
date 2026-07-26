/**
 * DataTransformationFailed Event
 *
 * Raised when data-transformation execution fails.
 */

export interface DataTransformationFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class DataTransformationFailed {
  readonly payload: DataTransformationFailedPayload;
  readonly eventName: string;

  constructor(payload: DataTransformationFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'data-transformation.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): DataTransformationFailed {
    return new DataTransformationFailed({
      layerName: 'data-transformation',
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

  toObject(): DataTransformationFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
