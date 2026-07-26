/**
 * BatchProcessingExecuted Event
 *
 * Raised when batch-processing execution completes.
 */

export interface BatchProcessingExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class BatchProcessingExecuted {
  readonly payload: BatchProcessingExecutedPayload;
  readonly eventName: string;

  constructor(payload: BatchProcessingExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'batch-processing.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): BatchProcessingExecuted {
    return new BatchProcessingExecuted({
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

  toObject(): BatchProcessingExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
