/**
 * DataQuality Interface
 *
 * Defines the contract for the Data quality validation layer.
 */

import { DataQualityResult, DataQualityContext } from '../types/data-quality-types';

export interface IDataQuality {
  /**
   * Execute the dataQuality operation
   */
  execute(context: DataQualityContext): Promise<DataQualityResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
