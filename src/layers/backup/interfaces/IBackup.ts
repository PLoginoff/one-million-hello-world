/**
 * Backup Interface
 *
 * Defines the contract for the Backup and disaster recovery layer.
 */

import { BackupResult, BackupContext } from '../types/backup-types';

export interface IBackup {
  /**
   * Execute the backup operation
   */
  execute(context: BackupContext): Promise<BackupResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
