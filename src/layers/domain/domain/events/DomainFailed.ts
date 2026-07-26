/**
 * DomainFailed Event
 *
 * Raised when domain execution fails.
 */

export interface DomainFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class DomainFailed {
  readonly payload: DomainFailedPayload;
  readonly eventName: string;

  constructor(payload: DomainFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'domain.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): DomainFailed {
    return new DomainFailed({
      layerName: 'domain',
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

  toObject(): DomainFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
