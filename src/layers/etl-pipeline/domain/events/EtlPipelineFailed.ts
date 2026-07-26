/**
 * EtlPipelineFailed Event
 *
 * Raised when etl-pipeline execution fails.
 */

export interface EtlPipelineFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class EtlPipelineFailed {
  readonly payload: EtlPipelineFailedPayload;
  readonly eventName: string;

  constructor(payload: EtlPipelineFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'etl-pipeline.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): EtlPipelineFailed {
    return new EtlPipelineFailed({
      layerName: 'etl-pipeline',
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

  toObject(): EtlPipelineFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
