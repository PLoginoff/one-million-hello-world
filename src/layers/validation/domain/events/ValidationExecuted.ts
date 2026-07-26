/**
 * ValidationExecuted Event
 *
 * Raised when validation execution completes.
 */

export interface ValidationExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class ValidationExecuted {
  readonly payload: ValidationExecutedPayload;
  readonly eventName: string;

  constructor(payload: ValidationExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'validation.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): ValidationExecuted {
    return new ValidationExecuted({
      layerName: 'validation',
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

  toObject(): ValidationExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
