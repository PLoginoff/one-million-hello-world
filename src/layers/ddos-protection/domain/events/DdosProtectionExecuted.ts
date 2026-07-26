/**
 * DdosProtectionExecuted Event
 *
 * Raised when ddos-protection execution completes.
 */

export interface DdosProtectionExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class DdosProtectionExecuted {
  readonly payload: DdosProtectionExecutedPayload;
  readonly eventName: string;

  constructor(payload: DdosProtectionExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'ddos-protection.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): DdosProtectionExecuted {
    return new DdosProtectionExecuted({
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

  toObject(): DdosProtectionExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
