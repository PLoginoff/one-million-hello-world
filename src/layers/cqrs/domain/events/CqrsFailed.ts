/**
 * CqrsFailed Event
 *
 * Raised when cqrs execution fails.
 */

export interface CqrsFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class CqrsFailed {
  readonly payload: CqrsFailedPayload;
  readonly eventName: string;

  constructor(payload: CqrsFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'cqrs.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): CqrsFailed {
    return new CqrsFailed({
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

  toObject(): CqrsFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
