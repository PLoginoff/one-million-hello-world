/**
 * PropertyTesting Interface
 *
 * Defines the contract for the Property-based testing layer.
 */

import { PropertyTestingResult, PropertyTestingContext } from '../types/property-testing-types';

export interface IPropertyTesting {
  /**
   * Execute the propertyTesting operation
   */
  execute(context: PropertyTestingContext): Promise<PropertyTestingResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
