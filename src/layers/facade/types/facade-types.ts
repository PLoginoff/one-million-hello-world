/**
 * Facade Layer Types
 * 
 * This module defines all type definitions for the Facade Layer,
 * including simplified interfaces, aggregation, and composition.
 */

/**
 * Facade operation result
 */
export interface FacadeResult<T> {
  success: boolean;
  data?: T;
  operations: string[];
  error?: string;
}

/**
 * Facade configuration
 */
export interface FacadeConfig {
  enableAggregation: boolean;
  enableComposition: boolean;
}
