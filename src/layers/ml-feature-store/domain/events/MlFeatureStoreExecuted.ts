/**
 * MlFeatureStoreExecuted Event
 *
 * Raised when ml-feature-store execution completes.
 */

export interface MlFeatureStoreExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class MlFeatureStoreExecuted {
  readonly payload: MlFeatureStoreExecutedPayload;
  readonly eventName: string;

  constructor(payload: MlFeatureStoreExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'ml-feature-store.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): MlFeatureStoreExecuted {
    return new MlFeatureStoreExecuted({
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

  toObject(): MlFeatureStoreExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
