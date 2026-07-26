/**
 * StrategyFailed Event
 *
 * Raised when strategy execution fails.
 */

export interface StrategyFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class StrategyFailed {
  readonly payload: StrategyFailedPayload;
  readonly eventName: string;

  constructor(payload: StrategyFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'strategy.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): StrategyFailed {
    return new StrategyFailed({
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

  toObject(): StrategyFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
