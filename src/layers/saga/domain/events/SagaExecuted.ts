/**
 * SagaExecuted Event
 *
 * Raised when saga execution completes.
 */

export interface SagaExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class SagaExecuted {
  readonly payload: SagaExecutedPayload;
  readonly eventName: string;

  constructor(payload: SagaExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'saga.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): SagaExecuted {
    return new SagaExecuted({
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

  toObject(): SagaExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
