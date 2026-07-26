/**
 * DdosProtectionFailed Event
 *
 * Raised when ddos-protection execution fails.
 */

export interface DdosProtectionFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class DdosProtectionFailed {
  readonly payload: DdosProtectionFailedPayload;
  readonly eventName: string;

  constructor(payload: DdosProtectionFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'ddos-protection.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): DdosProtectionFailed {
    return new DdosProtectionFailed({
      layerName: 'ddos-protection',
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

  toObject(): DdosProtectionFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
