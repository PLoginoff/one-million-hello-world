/**
 * DisasterRecoveryFailed Event
 *
 * Raised when disaster-recovery execution fails.
 */

export interface DisasterRecoveryFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class DisasterRecoveryFailed {
  readonly payload: DisasterRecoveryFailedPayload;
  readonly eventName: string;

  constructor(payload: DisasterRecoveryFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'disaster-recovery.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): DisasterRecoveryFailed {
    return new DisasterRecoveryFailed({
      layerName: 'disaster-recovery',
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

  toObject(): DisasterRecoveryFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
