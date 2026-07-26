/**
 * WorkflowEngineFailed Event
 *
 * Raised when workflow-engine execution fails.
 */

export interface WorkflowEngineFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class WorkflowEngineFailed {
  readonly payload: WorkflowEngineFailedPayload;
  readonly eventName: string;

  constructor(payload: WorkflowEngineFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'workflow-engine.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): WorkflowEngineFailed {
    return new WorkflowEngineFailed({
      layerName: 'workflow-engine',
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

  toObject(): WorkflowEngineFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
