/**
 * Migrations Interface
 *
 * Defines the contract for the Database migration and versioning layer.
 */

import { MigrationsResult, MigrationsContext } from '../types/migrations-types';

export interface IMigrations {
  /**
   * Execute the migrations operation
   */
  execute(context: MigrationsContext): Promise<MigrationsResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
