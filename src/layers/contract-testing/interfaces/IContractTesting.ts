/**
 * ContractTesting Interface
 *
 * Defines the contract for the Contract testing layer layer.
 */

import { ContractTestingResult, ContractTestingContext } from '../types/contract-testing-types';

export interface IContractTesting {
  /**
   * Execute the contractTesting operation
   */
  execute(context: ContractTestingContext): Promise<ContractTestingResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
