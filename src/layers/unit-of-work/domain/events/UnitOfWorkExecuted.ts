/**
 * UnitOfWorkExecuted Event
 *
 * Raised when unit-of-work execution completes.
 */

export interface UnitOfWorkExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class UnitOfWorkExecuted {
  readonly payload: UnitOfWorkExecutedPayload;
  readonly eventName: string;

  constructor(payload: UnitOfWorkExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'unit-of-work.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): UnitOfWorkExecuted {
    return new UnitOfWorkExecuted({
      layerName: 'unit-of-work',
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

  toObject(): UnitOfWorkExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
