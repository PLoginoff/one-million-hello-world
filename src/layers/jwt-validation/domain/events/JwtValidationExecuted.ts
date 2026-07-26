/**
 * JwtValidationExecuted Event
 *
 * Raised when jwt-validation execution completes.
 */

export interface JwtValidationExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class JwtValidationExecuted {
  readonly payload: JwtValidationExecutedPayload;
  readonly eventName: string;

  constructor(payload: JwtValidationExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'jwt-validation.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): JwtValidationExecuted {
    return new JwtValidationExecuted({
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

  toObject(): JwtValidationExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
