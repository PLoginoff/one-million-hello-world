/**
 * MlFeatureStoreFailed Event
 *
 * Raised when ml-feature-store execution fails.
 */

export interface MlFeatureStoreFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class MlFeatureStoreFailed {
  readonly payload: MlFeatureStoreFailedPayload;
  readonly eventName: string;

  constructor(payload: MlFeatureStoreFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'ml-feature-store.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): MlFeatureStoreFailed {
    return new MlFeatureStoreFailed({
      layerName: 'ml-feature-store',
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

  toObject(): MlFeatureStoreFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
