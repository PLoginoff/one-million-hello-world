/**
 * MultiTenancyFailed Event
 *
 * Raised when multi-tenancy execution fails.
 */

export interface MultiTenancyFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class MultiTenancyFailed {
  readonly payload: MultiTenancyFailedPayload;
  readonly eventName: string;

  constructor(payload: MultiTenancyFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'multi-tenancy.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): MultiTenancyFailed {
    return new MultiTenancyFailed({
      layerName: 'multi-tenancy',
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

  toObject(): MultiTenancyFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
