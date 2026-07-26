/**
 * SerializationExecuted Event
 *
 * Raised when serialization execution completes.
 */

export interface SerializationExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class SerializationExecuted {
  readonly payload: SerializationExecutedPayload;
  readonly eventName: string;

  constructor(payload: SerializationExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'serialization.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): SerializationExecuted {
    return new SerializationExecuted({
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

  toObject(): SerializationExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
