/**
 * CompressionFailed Event
 *
 * Raised when compression execution fails.
 */

export interface CompressionFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class CompressionFailed {
  readonly payload: CompressionFailedPayload;
  readonly eventName: string;

  constructor(payload: CompressionFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'compression.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): CompressionFailed {
    return new CompressionFailed({
      layerName: 'compression',
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

  toObject(): CompressionFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
