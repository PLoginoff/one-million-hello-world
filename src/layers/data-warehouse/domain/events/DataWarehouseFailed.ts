/**
 * DataWarehouseFailed Event
 *
 * Raised when data-warehouse execution fails.
 */

export interface DataWarehouseFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class DataWarehouseFailed {
  readonly payload: DataWarehouseFailedPayload;
  readonly eventName: string;

  constructor(payload: DataWarehouseFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'data-warehouse.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): DataWarehouseFailed {
    return new DataWarehouseFailed({
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

  toObject(): DataWarehouseFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
