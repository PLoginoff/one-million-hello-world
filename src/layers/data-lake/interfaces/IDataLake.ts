/**
 * DataLake Interface
 *
 * Defines the contract for the Data lake ingestion and storage layer.
 */

import { DataLakeResult, DataLakeContext } from '../types/data-lake-types';

export interface IDataLake {
  /**
   * Execute the dataLake operation
   */
  execute(context: DataLakeContext): Promise<DataLakeResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
