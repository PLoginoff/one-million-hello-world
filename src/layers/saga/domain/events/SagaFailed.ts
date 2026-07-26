/**
 * SagaFailed Event
 *
 * Raised when saga execution fails.
 */

export interface SagaFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class SagaFailed {
  readonly payload: SagaFailedPayload;
  readonly eventName: string;

  constructor(payload: SagaFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'saga.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): SagaFailed {
    return new SagaFailed({
      layerName: 'saga',
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

  toObject(): SagaFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
