/**
 * AuditFailed Event
 *
 * Raised when audit execution fails.
 */

export interface AuditFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class AuditFailed {
  readonly payload: AuditFailedPayload;
  readonly eventName: string;

  constructor(payload: AuditFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'audit.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): AuditFailed {
    return new AuditFailed({
      layerName: 'audit',
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

  toObject(): AuditFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
