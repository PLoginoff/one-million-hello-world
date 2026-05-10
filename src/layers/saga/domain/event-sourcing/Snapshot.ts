/**
 * Saga Snapshot
 *
 * Represents a snapshot of saga state at a specific point in time.
 * Used for performance optimization in event sourcing.
 */

export interface SnapshotData {
  snapshotId: string;
  executionId: string;
  version: number;
  timestamp: number;
  state: unknown;
  metadata?: Record<string, unknown>;
}

export class SagaSnapshot {
  readonly data: SnapshotData;

  constructor(data: SnapshotData) {
    this._validateSnapshot(data);
    this.data = { ...data };
  }

  /**
   * Get snapshot ID
   */
  getSnapshotId(): string {
    return this.data.snapshotId;
  }

  /**
   * Get execution ID
   */
  getExecutionId(): string {
    return this.data.executionId;
  }

  /**
   * Get version
   */
  getVersion(): number {
    return this.data.version;
  }

  /**
   * Get timestamp
   */
  getTimestamp(): number {
    return this.data.timestamp;
  }

  /**
   * Get state
   */
  getState(): unknown {
    return this.data.state;
  }

  /**
   * Get metadata
   */
  getMetadata(): Record<string, unknown> | undefined {
    return this.data.metadata;
  }

  /**
   * Check if is recent (within last hour)
   */
  isRecent(): boolean {
    const oneHour = 60 * 60 * 1000;
    return Date.now() - this.data.timestamp < oneHour;
  }

  /**
   * Create a copy
   */
  clone(): SagaSnapshot {
    return new SagaSnapshot({ ...this.data });
  }

  /**
   * Create snapshot from state
   */
  static createFromState(executionId: string, version: number, state: unknown): SagaSnapshot {
    return new SagaSnapshot({
      snapshotId: `snap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      executionId,
      version,
      timestamp: Date.now(),
      state,
    });
  }

  private _validateSnapshot(data: SnapshotData): void {
    if (!data.snapshotId || data.snapshotId.trim().length === 0) {
      throw new Error('Snapshot ID is required');
    }

    if (!data.executionId || data.executionId.trim().length === 0) {
      throw new Error('Execution ID is required');
    }

    if (data.version < 1) {
      throw new Error('Version must be at least 1');
    }
  }
}
