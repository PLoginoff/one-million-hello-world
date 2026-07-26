/**
 * SecretsFailed Event
 *
 * Raised when secrets execution fails.
 */

export interface SecretsFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class SecretsFailed {
  readonly payload: SecretsFailedPayload;
  readonly eventName: string;

  constructor(payload: SecretsFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'secrets.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): SecretsFailed {
    return new SecretsFailed({
      layerName: 'secrets',
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

  toObject(): SecretsFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
