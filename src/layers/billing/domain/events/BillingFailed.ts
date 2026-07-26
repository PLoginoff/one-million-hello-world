/**
 * BillingFailed Event
 *
 * Raised when billing execution fails.
 */

export interface BillingFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class BillingFailed {
  readonly payload: BillingFailedPayload;
  readonly eventName: string;

  constructor(payload: BillingFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'billing.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): BillingFailed {
    return new BillingFailed({
      layerName: 'billing',
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

  toObject(): BillingFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
