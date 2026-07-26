/**
 * DataLineageExecuted Event
 *
 * Raised when data-lineage execution completes.
 */

export interface DataLineageExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class DataLineageExecuted {
  readonly payload: DataLineageExecutedPayload;
  readonly eventName: string;

  constructor(payload: DataLineageExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'data-lineage.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): DataLineageExecuted {
    return new DataLineageExecuted({
      layerName: 'data-lineage',
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

  toObject(): DataLineageExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
