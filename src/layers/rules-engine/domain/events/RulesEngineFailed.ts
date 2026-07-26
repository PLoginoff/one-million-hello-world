/**
 * RulesEngineFailed Event
 *
 * Raised when rules-engine execution fails.
 */

export interface RulesEngineFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class RulesEngineFailed {
  readonly payload: RulesEngineFailedPayload;
  readonly eventName: string;

  constructor(payload: RulesEngineFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'rules-engine.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): RulesEngineFailed {
    return new RulesEngineFailed({
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

  toObject(): RulesEngineFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
