/**
 * EncryptionFailed Event
 *
 * Raised when encryption execution fails.
 */

export interface EncryptionFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class EncryptionFailed {
  readonly payload: EncryptionFailedPayload;
  readonly eventName: string;

  constructor(payload: EncryptionFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'encryption.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): EncryptionFailed {
    return new EncryptionFailed({
      layerName: 'encryption',
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

  toObject(): EncryptionFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
