/**
 * EtlPipeline Interface
 *
 * Defines the contract for the ETL pipeline orchestration layer.
 */

import { EtlPipelineResult, EtlPipelineContext } from '../types/etl-pipeline-types';

export interface IEtlPipeline {
  /**
   * Execute the etlPipeline operation
   */
  execute(context: EtlPipelineContext): Promise<EtlPipelineResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
