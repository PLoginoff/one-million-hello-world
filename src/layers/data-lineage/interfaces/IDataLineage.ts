/**
 * DataLineage Interface
 *
 * Defines the contract for the Data flow tracking and lineage graph layer.
 */

import { DataLineageResult, DataLineageContext } from '../types/data-lineage-types';

export interface IDataLineage {
  execute(context: DataLineageContext): Promise<DataLineageResult<unknown>>;
  configure(config: Record<string, unknown>): void;
  getStatus(): Record<string, unknown>;
}
