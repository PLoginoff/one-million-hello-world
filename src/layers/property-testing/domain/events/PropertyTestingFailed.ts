/**
 * PropertyTestingFailed Event
 *
 * Raised when property-testing execution fails.
 */

export interface PropertyTestingFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class PropertyTestingFailed {
  readonly payload: PropertyTestingFailedPayload;
  readonly eventName: string;

  constructor(payload: PropertyTestingFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'property-testing.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): PropertyTestingFailed {
    return new PropertyTestingFailed({
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

  toObject(): PropertyTestingFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
