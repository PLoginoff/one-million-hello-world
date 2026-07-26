/**
 * ChaosEngineeringExecuted Event
 *
 * Raised when chaos-engineering execution completes.
 */

export interface ChaosEngineeringExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class ChaosEngineeringExecuted {
  readonly payload: ChaosEngineeringExecutedPayload;
  readonly eventName: string;

  constructor(payload: ChaosEngineeringExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'chaos-engineering.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): ChaosEngineeringExecuted {
    return new ChaosEngineeringExecuted({
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

  toObject(): ChaosEngineeringExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
