/**
 * JwtValidationFailed Event
 *
 * Raised when jwt-validation execution fails.
 */

export interface JwtValidationFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class JwtValidationFailed {
  readonly payload: JwtValidationFailedPayload;
  readonly eventName: string;

  constructor(payload: JwtValidationFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'jwt-validation.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): JwtValidationFailed {
    return new JwtValidationFailed({
      layerName: 'jwt-validation',
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

  toObject(): JwtValidationFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
