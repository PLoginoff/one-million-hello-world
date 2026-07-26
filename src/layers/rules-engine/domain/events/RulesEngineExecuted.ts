/**
 * RulesEngineExecuted Event
 *
 * Raised when rules-engine execution completes.
 */

export interface RulesEngineExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class RulesEngineExecuted {
  readonly payload: RulesEngineExecutedPayload;
  readonly eventName: string;

  constructor(payload: RulesEngineExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'rules-engine.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): RulesEngineExecuted {
    return new RulesEngineExecuted({
      layerName: 'rules-engine',
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

  toObject(): RulesEngineExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
