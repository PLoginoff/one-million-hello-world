/**
 * CostOptimizationFailed Event
 *
 * Raised when cost-optimization execution fails.
 */

export interface CostOptimizationFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class CostOptimizationFailed {
  readonly payload: CostOptimizationFailedPayload;
  readonly eventName: string;

  constructor(payload: CostOptimizationFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'cost-optimization.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): CostOptimizationFailed {
    return new CostOptimizationFailed({
      layerName: 'cost-optimization',
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

  toObject(): CostOptimizationFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
