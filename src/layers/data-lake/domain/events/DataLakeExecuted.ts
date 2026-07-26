/**
 * DataLakeExecuted Event
 *
 * Raised when data-lake execution completes.
 */

export interface DataLakeExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class DataLakeExecuted {
  readonly payload: DataLakeExecutedPayload;
  readonly eventName: string;

  constructor(payload: DataLakeExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'data-lake.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): DataLakeExecuted {
    return new DataLakeExecuted({
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

  toObject(): DataLakeExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
