/**
 * LoadBalancerFailed Event
 *
 * Raised when load-balancer execution fails.
 */

export interface LoadBalancerFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class LoadBalancerFailed {
  readonly payload: LoadBalancerFailedPayload;
  readonly eventName: string;

  constructor(payload: LoadBalancerFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'load-balancer.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): LoadBalancerFailed {
    return new LoadBalancerFailed({
      layerName: 'load-balancer',
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

  toObject(): LoadBalancerFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
