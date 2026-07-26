/**
 * LoadBalancerExecuted Event
 *
 * Raised when load-balancer execution completes.
 */

export interface LoadBalancerExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class LoadBalancerExecuted {
  readonly payload: LoadBalancerExecutedPayload;
  readonly eventName: string;

  constructor(payload: LoadBalancerExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'load-balancer.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): LoadBalancerExecuted {
    return new LoadBalancerExecuted({
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

  toObject(): LoadBalancerExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
