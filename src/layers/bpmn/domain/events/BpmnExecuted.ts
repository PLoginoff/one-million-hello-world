/**
 * BpmnExecuted Event
 *
 * Raised when bpmn execution completes.
 */

export interface BpmnExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class BpmnExecuted {
  readonly payload: BpmnExecutedPayload;
  readonly eventName: string;

  constructor(payload: BpmnExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'bpmn.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): BpmnExecuted {
    return new BpmnExecuted({
      layerName: 'bpmn',
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

  toObject(): BpmnExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
