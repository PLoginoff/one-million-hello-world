/**
 * BpmnFailed Event
 *
 * Raised when bpmn execution fails.
 */

export interface BpmnFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class BpmnFailed {
  readonly payload: BpmnFailedPayload;
  readonly eventName: string;

  constructor(payload: BpmnFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'bpmn.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): BpmnFailed {
    return new BpmnFailed({
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

  toObject(): BpmnFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
