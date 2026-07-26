/**
 * GitopsFailed Event
 *
 * Raised when gitops execution fails.
 */

export interface GitopsFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class GitopsFailed {
  readonly payload: GitopsFailedPayload;
  readonly eventName: string;

  constructor(payload: GitopsFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'gitops.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): GitopsFailed {
    return new GitopsFailed({
      layerName: 'gitops',
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

  toObject(): GitopsFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
