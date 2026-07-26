/**
 * DataLineageFailed Event
 *
 * Raised when data-lineage execution fails.
 */

export interface DataLineageFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class DataLineageFailed {
  readonly payload: DataLineageFailedPayload;
  readonly eventName: string;

  constructor(payload: DataLineageFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'data-lineage.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): DataLineageFailed {
    return new DataLineageFailed({
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

  toObject(): DataLineageFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
