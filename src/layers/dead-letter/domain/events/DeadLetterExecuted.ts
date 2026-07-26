/**
 * DeadLetterExecuted Event
 *
 * Raised when dead-letter execution completes.
 */

export interface DeadLetterExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class DeadLetterExecuted {
  readonly payload: DeadLetterExecutedPayload;
  readonly eventName: string;

  constructor(payload: DeadLetterExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'dead-letter.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): DeadLetterExecuted {
    return new DeadLetterExecuted({
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

  toObject(): DeadLetterExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
