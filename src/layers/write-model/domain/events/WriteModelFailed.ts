/**
 * WriteModelFailed Event
 *
 * Raised when write-model execution fails.
 */

export interface WriteModelFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class WriteModelFailed {
  readonly payload: WriteModelFailedPayload;
  readonly eventName: string;

  constructor(payload: WriteModelFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'write-model.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): WriteModelFailed {
    return new WriteModelFailed({
      layerName: 'write-model',
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

  toObject(): WriteModelFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
