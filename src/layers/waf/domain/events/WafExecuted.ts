/**
 * WafExecuted Event
 *
 * Raised when waf execution completes.
 */

export interface WafExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class WafExecuted {
  readonly payload: WafExecutedPayload;
  readonly eventName: string;

  constructor(payload: WafExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'waf.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): WafExecuted {
    return new WafExecuted({
      layerName: 'waf',
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

  toObject(): WafExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
