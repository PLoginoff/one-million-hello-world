/**
 * GitopsExecuted Event
 *
 * Raised when gitops execution completes.
 */

export interface GitopsExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class GitopsExecuted {
  readonly payload: GitopsExecutedPayload;
  readonly eventName: string;

  constructor(payload: GitopsExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'gitops.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): GitopsExecuted {
    return new GitopsExecuted({
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

  toObject(): GitopsExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
