/**
 * CompressionExecuted Event
 *
 * Raised when compression execution completes.
 */

export interface CompressionExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class CompressionExecuted {
  readonly payload: CompressionExecutedPayload;
  readonly eventName: string;

  constructor(payload: CompressionExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'compression.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): CompressionExecuted {
    return new CompressionExecuted({
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

  toObject(): CompressionExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
