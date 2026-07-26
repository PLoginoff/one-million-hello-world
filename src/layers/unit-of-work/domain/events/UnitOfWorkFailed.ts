/**
 * UnitOfWorkFailed Event
 *
 * Raised when unit-of-work execution fails.
 */

export interface UnitOfWorkFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class UnitOfWorkFailed {
  readonly payload: UnitOfWorkFailedPayload;
  readonly eventName: string;

  constructor(payload: UnitOfWorkFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'unit-of-work.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): UnitOfWorkFailed {
    return new UnitOfWorkFailed({
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

  toObject(): UnitOfWorkFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
