/**
 * FacadeFailed Event
 *
 * Raised when facade execution fails.
 */

export interface FacadeFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class FacadeFailed {
  readonly payload: FacadeFailedPayload;
  readonly eventName: string;

  constructor(payload: FacadeFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'facade.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): FacadeFailed {
    return new FacadeFailed({
      layerName: 'facade',
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

  toObject(): FacadeFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
