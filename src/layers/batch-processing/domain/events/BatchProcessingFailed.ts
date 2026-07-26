/**
 * BatchProcessingFailed Event
 *
 * Raised when batch-processing execution fails.
 */

export interface BatchProcessingFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class BatchProcessingFailed {
  readonly payload: BatchProcessingFailedPayload;
  readonly eventName: string;

  constructor(payload: BatchProcessingFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'batch-processing.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): BatchProcessingFailed {
    return new BatchProcessingFailed({
      layerName: 'batch-processing',
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

  toObject(): BatchProcessingFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
