/**
 * EtlPipelineExecuted Event
 *
 * Raised when etl-pipeline execution completes.
 */

export interface EtlPipelineExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class EtlPipelineExecuted {
  readonly payload: EtlPipelineExecutedPayload;
  readonly eventName: string;

  constructor(payload: EtlPipelineExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'etl-pipeline.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): EtlPipelineExecuted {
    return new EtlPipelineExecuted({
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

  toObject(): EtlPipelineExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
