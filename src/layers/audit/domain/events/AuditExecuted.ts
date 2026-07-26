/**
 * AuditExecuted Event
 *
 * Raised when audit execution completes.
 */

export interface AuditExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class AuditExecuted {
  readonly payload: AuditExecutedPayload;
  readonly eventName: string;

  constructor(payload: AuditExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'audit.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): AuditExecuted {
    return new AuditExecuted({
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

  toObject(): AuditExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
