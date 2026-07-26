/**
 * ChaosEngineeringFailed Event
 *
 * Raised when chaos-engineering execution fails.
 */

export interface ChaosEngineeringFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class ChaosEngineeringFailed {
  readonly payload: ChaosEngineeringFailedPayload;
  readonly eventName: string;

  constructor(payload: ChaosEngineeringFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'chaos-engineering.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): ChaosEngineeringFailed {
    return new ChaosEngineeringFailed({
      layerName: 'chaos-engineering',
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

  toObject(): ChaosEngineeringFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
