/**
 * ControllerExecuted Event
 *
 * Raised when controller execution completes.
 */

export interface ControllerExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class ControllerExecuted {
  readonly payload: ControllerExecutedPayload;
  readonly eventName: string;

  constructor(payload: ControllerExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'controller.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): ControllerExecuted {
    return new ControllerExecuted({
      layerName: 'controller',
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

  toObject(): ControllerExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
