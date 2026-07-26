/**
 * DataLakeFailed Event
 *
 * Raised when data-lake execution fails.
 */

export interface DataLakeFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class DataLakeFailed {
  readonly payload: DataLakeFailedPayload;
  readonly eventName: string;

  constructor(payload: DataLakeFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'data-lake.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): DataLakeFailed {
    return new DataLakeFailed({
      layerName: 'data-lake',
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

  toObject(): DataLakeFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
