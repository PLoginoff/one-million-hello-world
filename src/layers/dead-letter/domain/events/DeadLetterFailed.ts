/**
 * DeadLetterFailed Event
 *
 * Raised when dead-letter execution fails.
 */

export interface DeadLetterFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class DeadLetterFailed {
  readonly payload: DeadLetterFailedPayload;
  readonly eventName: string;

  constructor(payload: DeadLetterFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'dead-letter.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): DeadLetterFailed {
    return new DeadLetterFailed({
      layerName: 'dead-letter',
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

  toObject(): DeadLetterFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
