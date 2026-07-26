/**
 * DataTransformationExecuted Event
 *
 * Raised when data-transformation execution completes.
 */

export interface DataTransformationExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class DataTransformationExecuted {
  readonly payload: DataTransformationExecutedPayload;
  readonly eventName: string;

  constructor(payload: DataTransformationExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'data-transformation.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): DataTransformationExecuted {
    return new DataTransformationExecuted({
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

  toObject(): DataTransformationExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
