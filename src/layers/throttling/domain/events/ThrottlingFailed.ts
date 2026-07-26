/**
 * ThrottlingFailed Event
 *
 * Raised when throttling execution fails.
 */

export interface ThrottlingFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class ThrottlingFailed {
  readonly payload: ThrottlingFailedPayload;
  readonly eventName: string;

  constructor(payload: ThrottlingFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'throttling.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): ThrottlingFailed {
    return new ThrottlingFailed({
      layerName: 'throttling',
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

  toObject(): ThrottlingFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
