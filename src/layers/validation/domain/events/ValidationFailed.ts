/**
 * ValidationFailed Event
 *
 * Raised when validation execution fails.
 */

export interface ValidationFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class ValidationFailed {
  readonly payload: ValidationFailedPayload;
  readonly eventName: string;

  constructor(payload: ValidationFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'validation.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): ValidationFailed {
    return new ValidationFailed({
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

  toObject(): ValidationFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
