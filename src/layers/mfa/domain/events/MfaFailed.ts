/**
 * MfaFailed Event
 *
 * Raised when mfa execution fails.
 */

export interface MfaFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class MfaFailed {
  readonly payload: MfaFailedPayload;
  readonly eventName: string;

  constructor(payload: MfaFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'mfa.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): MfaFailed {
    return new MfaFailed({
      layerName: 'mfa',
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

  toObject(): MfaFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
