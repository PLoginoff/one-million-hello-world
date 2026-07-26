/**
 * WafFailed Event
 *
 * Raised when waf execution fails.
 */

export interface WafFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class WafFailed {
  readonly payload: WafFailedPayload;
  readonly eventName: string;

  constructor(payload: WafFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'waf.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): WafFailed {
    return new WafFailed({
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

  toObject(): WafFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
