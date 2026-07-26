/**
 * SecretsRotationExecuted Event
 *
 * Raised when secrets-rotation execution completes.
 */

export interface SecretsRotationExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class SecretsRotationExecuted {
  readonly payload: SecretsRotationExecutedPayload;
  readonly eventName: string;

  constructor(payload: SecretsRotationExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'secrets-rotation.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): SecretsRotationExecuted {
    return new SecretsRotationExecuted({
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

  toObject(): SecretsRotationExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
