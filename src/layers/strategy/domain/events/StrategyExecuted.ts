/**
 * StrategyExecuted Event
 *
 * Raised when strategy execution completes.
 */

export interface StrategyExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class StrategyExecuted {
  readonly payload: StrategyExecutedPayload;
  readonly eventName: string;

  constructor(payload: StrategyExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'strategy.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): StrategyExecuted {
    return new StrategyExecuted({
      layerName: 'strategy',
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

  toObject(): StrategyExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
