/**
 * Specification Interface
 *
 * Defines the contract for the Specification pattern layer layer.
 */

import { SpecificationResult, SpecificationContext } from '../types/specification-types';

export interface ISpecification {
  /**
   * Execute the specification operation
   */
  execute(context: SpecificationContext): Promise<SpecificationResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
