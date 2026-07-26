/**
 * PropertyTestingExecuted Event
 *
 * Raised when property-testing execution completes.
 */

export interface PropertyTestingExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class PropertyTestingExecuted {
  readonly payload: PropertyTestingExecutedPayload;
  readonly eventName: string;

  constructor(payload: PropertyTestingExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'property-testing.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): PropertyTestingExecuted {
    return new PropertyTestingExecuted({
      layerName: 'property-testing',
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

  toObject(): PropertyTestingExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
