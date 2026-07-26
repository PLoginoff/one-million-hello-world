/**
 * CdnIntegrationExecuted Event
 *
 * Raised when cdn-integration execution completes.
 */

export interface CdnIntegrationExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class CdnIntegrationExecuted {
  readonly payload: CdnIntegrationExecutedPayload;
  readonly eventName: string;

  constructor(payload: CdnIntegrationExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'cdn-integration.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): CdnIntegrationExecuted {
    return new CdnIntegrationExecuted({
      layerName: 'cdn-integration',
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

  toObject(): CdnIntegrationExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
