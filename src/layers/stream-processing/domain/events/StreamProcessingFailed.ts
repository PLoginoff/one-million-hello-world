/**
 * StreamProcessingFailed Event
 *
 * Raised when stream-processing execution fails.
 */

export interface StreamProcessingFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class StreamProcessingFailed {
  readonly payload: StreamProcessingFailedPayload;
  readonly eventName: string;

  constructor(payload: StreamProcessingFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'stream-processing.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): StreamProcessingFailed {
    return new StreamProcessingFailed({
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

  toObject(): StreamProcessingFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
