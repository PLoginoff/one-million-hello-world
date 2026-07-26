/**
 * MultiTenancyExecuted Event
 *
 * Raised when multi-tenancy execution completes.
 */

export interface MultiTenancyExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class MultiTenancyExecuted {
  readonly payload: MultiTenancyExecutedPayload;
  readonly eventName: string;

  constructor(payload: MultiTenancyExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'multi-tenancy.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): MultiTenancyExecuted {
    return new MultiTenancyExecuted({
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

  toObject(): MultiTenancyExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
