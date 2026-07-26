/**
 * MfaExecuted Event
 *
 * Raised when mfa execution completes.
 */

export interface MfaExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class MfaExecuted {
  readonly payload: MfaExecutedPayload;
  readonly eventName: string;

  constructor(payload: MfaExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'mfa.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): MfaExecuted {
    return new MfaExecuted({
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

  toObject(): MfaExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
