/**
 * PolicyEngineFailed Event
 *
 * Raised when policy-engine execution fails.
 */

export interface PolicyEngineFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class PolicyEngineFailed {
  readonly payload: PolicyEngineFailedPayload;
  readonly eventName: string;

  constructor(payload: PolicyEngineFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'policy-engine.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): PolicyEngineFailed {
    return new PolicyEngineFailed({
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

  toObject(): PolicyEngineFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
