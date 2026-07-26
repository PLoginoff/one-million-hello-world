/**
 * ProxyFailed Event
 *
 * Raised when proxy execution fails.
 */

export interface ProxyFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class ProxyFailed {
  readonly payload: ProxyFailedPayload;
  readonly eventName: string;

  constructor(payload: ProxyFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'proxy.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): ProxyFailed {
    return new ProxyFailed({
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

  toObject(): ProxyFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
