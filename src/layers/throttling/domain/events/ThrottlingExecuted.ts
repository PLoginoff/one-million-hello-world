/**
 * ThrottlingExecuted Event
 *
 * Raised when throttling execution completes.
 */

export interface ThrottlingExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class ThrottlingExecuted {
  readonly payload: ThrottlingExecutedPayload;
  readonly eventName: string;

  constructor(payload: ThrottlingExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'throttling.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): ThrottlingExecuted {
    return new ThrottlingExecuted({
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

  toObject(): ThrottlingExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
