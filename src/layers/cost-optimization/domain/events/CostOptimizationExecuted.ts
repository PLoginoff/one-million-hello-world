/**
 * CostOptimizationExecuted Event
 *
 * Raised when cost-optimization execution completes.
 */

export interface CostOptimizationExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class CostOptimizationExecuted {
  readonly payload: CostOptimizationExecutedPayload;
  readonly eventName: string;

  constructor(payload: CostOptimizationExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'cost-optimization.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): CostOptimizationExecuted {
    return new CostOptimizationExecuted({
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

  toObject(): CostOptimizationExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
