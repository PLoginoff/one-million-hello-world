/**
 * FeatureFlagsExecuted Event
 *
 * Raised when feature-flags execution completes.
 */

export interface FeatureFlagsExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class FeatureFlagsExecuted {
  readonly payload: FeatureFlagsExecutedPayload;
  readonly eventName: string;

  constructor(payload: FeatureFlagsExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'feature-flags.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): FeatureFlagsExecuted {
    return new FeatureFlagsExecuted({
      layerName: 'feature-flags',
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

  toObject(): FeatureFlagsExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
