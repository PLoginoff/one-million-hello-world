/**
 * ReadModelFailed Event
 *
 * Raised when read-model execution fails.
 */

export interface ReadModelFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class ReadModelFailed {
  readonly payload: ReadModelFailedPayload;
  readonly eventName: string;

  constructor(payload: ReadModelFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'read-model.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): ReadModelFailed {
    return new ReadModelFailed({
      layerName: 'read-model',
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

  toObject(): ReadModelFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
