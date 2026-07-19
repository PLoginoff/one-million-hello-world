/**
 * CostOptimization Interface
 *
 * Defines the contract for the FinOps resource optimization and cost tracking layer.
 */

import { CostOptimizationResult, CostOptimizationContext } from '../types/cost-optimization-types';

export interface ICostOptimization {
  execute(context: CostOptimizationContext): Promise<CostOptimizationResult<unknown>>;
  configure(config: Record<string, unknown>): void;
  getStatus(): Record<string, unknown>;
}
