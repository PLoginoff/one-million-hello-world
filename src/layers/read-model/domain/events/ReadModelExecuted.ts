/**
 * ReadModelExecuted Event
 *
 * Raised when read-model execution completes.
 */

export interface ReadModelExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class ReadModelExecuted {
  readonly payload: ReadModelExecutedPayload;
  readonly eventName: string;

  constructor(payload: ReadModelExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'read-model.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): ReadModelExecuted {
    return new ReadModelExecuted({
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

  toObject(): ReadModelExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
