/**
 * BillingExecuted Event
 *
 * Raised when billing execution completes.
 */

export interface BillingExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class BillingExecuted {
  readonly payload: BillingExecutedPayload;
  readonly eventName: string;

  constructor(payload: BillingExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'billing.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): BillingExecuted {
    return new BillingExecuted({
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

  toObject(): BillingExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
