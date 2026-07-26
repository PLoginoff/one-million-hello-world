/**
 * PolicyEngineExecuted Event
 *
 * Raised when policy-engine execution completes.
 */

export interface PolicyEngineExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class PolicyEngineExecuted {
  readonly payload: PolicyEngineExecutedPayload;
  readonly eventName: string;

  constructor(payload: PolicyEngineExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'policy-engine.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): PolicyEngineExecuted {
    return new PolicyEngineExecuted({
      layerName: 'policy-engine',
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

  toObject(): PolicyEngineExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
