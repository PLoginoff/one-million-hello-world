/**
 * DataQualityExecuted Event
 *
 * Raised when data-quality execution completes.
 */

export interface DataQualityExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class DataQualityExecuted {
  readonly payload: DataQualityExecutedPayload;
  readonly eventName: string;

  constructor(payload: DataQualityExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'data-quality.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): DataQualityExecuted {
    return new DataQualityExecuted({
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

  toObject(): DataQualityExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
