/**
 * EncryptionExecuted Event
 *
 * Raised when encryption execution completes.
 */

export interface EncryptionExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class EncryptionExecuted {
  readonly payload: EncryptionExecutedPayload;
  readonly eventName: string;

  constructor(payload: EncryptionExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'encryption.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): EncryptionExecuted {
    return new EncryptionExecuted({
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

  toObject(): EncryptionExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
