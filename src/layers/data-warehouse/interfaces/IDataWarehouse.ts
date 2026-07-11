/**
 * DataWarehouse Interface
 *
 * Defines the contract for the Data warehouse abstraction layer.
 */

import { DataWarehouseResult, DataWarehouseContext } from '../types/data-warehouse-types';

export interface IDataWarehouse {
  /**
   * Execute the dataWarehouse operation
   */
  execute(context: DataWarehouseContext): Promise<DataWarehouseResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
