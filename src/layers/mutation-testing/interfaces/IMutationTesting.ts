/**
 * MutationTesting Interface
 *
 * Defines the contract for the Mutation testing layer layer.
 */

import { MutationTestingResult, MutationTestingContext } from '../types/mutation-testing-types';

export interface IMutationTesting {
  /**
   * Execute the mutationTesting operation
   */
  execute(context: MutationTestingContext): Promise<MutationTestingResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
