/**
 * SecretsRotationFailed Event
 *
 * Raised when secrets-rotation execution fails.
 */

export interface SecretsRotationFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class SecretsRotationFailed {
  readonly payload: SecretsRotationFailedPayload;
  readonly eventName: string;

  constructor(payload: SecretsRotationFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'secrets-rotation.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): SecretsRotationFailed {
    return new SecretsRotationFailed({
      layerName: 'secrets-rotation',
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

  toObject(): SecretsRotationFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
