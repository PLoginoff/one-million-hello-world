/**
 * ProxyExecuted Event
 *
 * Raised when proxy execution completes.
 */

export interface ProxyExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class ProxyExecuted {
  readonly payload: ProxyExecutedPayload;
  readonly eventName: string;

  constructor(payload: ProxyExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'proxy.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): ProxyExecuted {
    return new ProxyExecuted({
      layerName: 'proxy',
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

  toObject(): ProxyExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
