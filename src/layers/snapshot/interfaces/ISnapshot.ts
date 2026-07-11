/**
 * Snapshot Interface
 *
 * Defines the contract for the Snapshot storage and optimization layer.
 */

import { SnapshotResult, SnapshotContext } from '../types/snapshot-types';

export interface ISnapshot {
  /**
   * Execute the snapshot operation
   */
  execute(context: SnapshotContext): Promise<SnapshotResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
