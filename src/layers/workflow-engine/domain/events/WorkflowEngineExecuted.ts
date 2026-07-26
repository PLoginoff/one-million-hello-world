/**
 * WorkflowEngineExecuted Event
 *
 * Raised when workflow-engine execution completes.
 */

export interface WorkflowEngineExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class WorkflowEngineExecuted {
  readonly payload: WorkflowEngineExecutedPayload;
  readonly eventName: string;

  constructor(payload: WorkflowEngineExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'workflow-engine.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): WorkflowEngineExecuted {
    return new WorkflowEngineExecuted({
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

  toObject(): WorkflowEngineExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
