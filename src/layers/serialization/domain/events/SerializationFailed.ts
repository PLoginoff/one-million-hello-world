/**
 * SerializationFailed Event
 *
 * Raised when serialization execution fails.
 */

export interface SerializationFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class SerializationFailed {
  readonly payload: SerializationFailedPayload;
  readonly eventName: string;

  constructor(payload: SerializationFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'serialization.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): SerializationFailed {
    return new SerializationFailed({
      layerName: 'serialization',
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

  toObject(): SerializationFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
