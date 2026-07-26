/**
 * DataWarehouseExecuted Event
 *
 * Raised when data-warehouse execution completes.
 */

export interface DataWarehouseExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class DataWarehouseExecuted {
  readonly payload: DataWarehouseExecutedPayload;
  readonly eventName: string;

  constructor(payload: DataWarehouseExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'data-warehouse.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): DataWarehouseExecuted {
    return new DataWarehouseExecuted({
      layerName: 'data-warehouse',
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

  toObject(): DataWarehouseExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
