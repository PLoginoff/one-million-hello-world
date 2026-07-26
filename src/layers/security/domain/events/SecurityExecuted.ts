/**
 * SecurityExecuted Event
 *
 * Raised when security execution completes.
 */

export interface SecurityExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class SecurityExecuted {
  readonly payload: SecurityExecutedPayload;
  readonly eventName: string;

  constructor(payload: SecurityExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'security.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): SecurityExecuted {
    return new SecurityExecuted({
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

  toObject(): SecurityExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
