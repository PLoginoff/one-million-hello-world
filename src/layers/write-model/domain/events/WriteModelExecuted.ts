/**
 * WriteModelExecuted Event
 *
 * Raised when write-model execution completes.
 */

export interface WriteModelExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class WriteModelExecuted {
  readonly payload: WriteModelExecutedPayload;
  readonly eventName: string;

  constructor(payload: WriteModelExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'write-model.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): WriteModelExecuted {
    return new WriteModelExecuted({
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

  toObject(): WriteModelExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
