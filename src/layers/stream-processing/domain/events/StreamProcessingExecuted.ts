/**
 * StreamProcessingExecuted Event
 *
 * Raised when stream-processing execution completes.
 */

export interface StreamProcessingExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class StreamProcessingExecuted {
  readonly payload: StreamProcessingExecutedPayload;
  readonly eventName: string;

  constructor(payload: StreamProcessingExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'stream-processing.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): StreamProcessingExecuted {
    return new StreamProcessingExecuted({
      layerName: 'stream-processing',
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

  toObject(): StreamProcessingExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
