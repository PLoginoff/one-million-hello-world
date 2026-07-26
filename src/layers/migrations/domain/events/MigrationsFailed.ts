/**
 * MigrationsFailed Event
 *
 * Raised when migrations execution fails.
 */

export interface MigrationsFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class MigrationsFailed {
  readonly payload: MigrationsFailedPayload;
  readonly eventName: string;

  constructor(payload: MigrationsFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'migrations.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): MigrationsFailed {
    return new MigrationsFailed({
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

  toObject(): MigrationsFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
