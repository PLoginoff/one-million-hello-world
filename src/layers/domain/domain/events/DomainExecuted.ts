/**
 * DomainExecuted Event
 *
 * Raised when domain execution completes.
 */

export interface DomainExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class DomainExecuted {
  readonly payload: DomainExecutedPayload;
  readonly eventName: string;

  constructor(payload: DomainExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'domain.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): DomainExecuted {
    return new DomainExecuted({
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

  toObject(): DomainExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
