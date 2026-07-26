/**
 * GovernanceExecuted Event
 *
 * Raised when governance execution completes.
 */

export interface GovernanceExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class GovernanceExecuted {
  readonly payload: GovernanceExecutedPayload;
  readonly eventName: string;

  constructor(payload: GovernanceExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'governance.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): GovernanceExecuted {
    return new GovernanceExecuted({
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

  toObject(): GovernanceExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
