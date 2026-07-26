/**
 * CdnIntegrationFailed Event
 *
 * Raised when cdn-integration execution fails.
 */

export interface CdnIntegrationFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class CdnIntegrationFailed {
  readonly payload: CdnIntegrationFailedPayload;
  readonly eventName: string;

  constructor(payload: CdnIntegrationFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'cdn-integration.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): CdnIntegrationFailed {
    return new CdnIntegrationFailed({
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

  toObject(): CdnIntegrationFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
