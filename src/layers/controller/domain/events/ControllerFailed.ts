/**
 * ControllerFailed Event
 *
 * Raised when controller execution fails.
 */

export interface ControllerFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class ControllerFailed {
  readonly payload: ControllerFailedPayload;
  readonly eventName: string;

  constructor(payload: ControllerFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'controller.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): ControllerFailed {
    return new ControllerFailed({
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

  toObject(): ControllerFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
