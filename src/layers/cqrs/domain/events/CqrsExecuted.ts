/**
 * CqrsExecuted Event
 *
 * Raised when cqrs execution completes.
 */

export interface CqrsExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class CqrsExecuted {
  readonly payload: CqrsExecutedPayload;
  readonly eventName: string;

  constructor(payload: CqrsExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'cqrs.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): CqrsExecuted {
    return new CqrsExecuted({
      layerName: 'cqrs',
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

  toObject(): CqrsExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
