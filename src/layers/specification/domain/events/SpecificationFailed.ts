/**
 * SpecificationFailed Event
 *
 * Raised when specification execution fails.
 */

export interface SpecificationFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class SpecificationFailed {
  readonly payload: SpecificationFailedPayload;
  readonly eventName: string;

  constructor(payload: SpecificationFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'specification.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): SpecificationFailed {
    return new SpecificationFailed({
      layerName: 'specification',
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

  toObject(): SpecificationFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
