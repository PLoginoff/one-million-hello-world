/**
 * GovernanceFailed Event
 *
 * Raised when governance execution fails.
 */

export interface GovernanceFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class GovernanceFailed {
  readonly payload: GovernanceFailedPayload;
  readonly eventName: string;

  constructor(payload: GovernanceFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'governance.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): GovernanceFailed {
    return new GovernanceFailed({
      layerName: 'governance',
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

  toObject(): GovernanceFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
