/**
 * MigrationsExecuted Event
 *
 * Raised when migrations execution completes.
 */

export interface MigrationsExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class MigrationsExecuted {
  readonly payload: MigrationsExecutedPayload;
  readonly eventName: string;

  constructor(payload: MigrationsExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'migrations.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): MigrationsExecuted {
    return new MigrationsExecuted({
      layerName: 'migrations',
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

  toObject(): MigrationsExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
