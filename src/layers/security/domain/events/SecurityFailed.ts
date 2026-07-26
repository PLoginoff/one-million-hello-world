/**
 * SecurityFailed Event
 *
 * Raised when security execution fails.
 */

export interface SecurityFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class SecurityFailed {
  readonly payload: SecurityFailedPayload;
  readonly eventName: string;

  constructor(payload: SecurityFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'security.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): SecurityFailed {
    return new SecurityFailed({
      layerName: 'security',
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

  toObject(): SecurityFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
