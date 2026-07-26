/**
 * SpecificationExecuted Event
 *
 * Raised when specification execution completes.
 */

export interface SpecificationExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class SpecificationExecuted {
  readonly payload: SpecificationExecutedPayload;
  readonly eventName: string;

  constructor(payload: SpecificationExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'specification.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): SpecificationExecuted {
    return new SpecificationExecuted({
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

  toObject(): SpecificationExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
