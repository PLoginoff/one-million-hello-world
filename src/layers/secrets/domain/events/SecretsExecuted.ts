/**
 * SecretsExecuted Event
 *
 * Raised when secrets execution completes.
 */

export interface SecretsExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class SecretsExecuted {
  readonly payload: SecretsExecutedPayload;
  readonly eventName: string;

  constructor(payload: SecretsExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'secrets.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): SecretsExecuted {
    return new SecretsExecuted({
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

  toObject(): SecretsExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
