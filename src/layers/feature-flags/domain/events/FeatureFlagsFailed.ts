/**
 * FeatureFlagsFailed Event
 *
 * Raised when feature-flags execution fails.
 */

export interface FeatureFlagsFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class FeatureFlagsFailed {
  readonly payload: FeatureFlagsFailedPayload;
  readonly eventName: string;

  constructor(payload: FeatureFlagsFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'feature-flags.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): FeatureFlagsFailed {
    return new FeatureFlagsFailed({
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

  toObject(): FeatureFlagsFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
