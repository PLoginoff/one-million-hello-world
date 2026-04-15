/**
 * Circuit Breaker Interface
 * 
 * Defines the contract for circuit breaker operations
 * including fault tolerance and fallback strategies.
 */

import {
  CircuitState,
  CircuitStats,
  CircuitConfig,
  CircuitResult,
} from '../types/circuit-breaker-types';

/**
 * Fallback function type
 */
export type FallbackFunction<T> = () => T | Promise<T>;

/**
 * Interface for circuit breaker operations
 */
export interface ICircuitBreaker {
  /**
   * Executes operation with circuit breaker protection
   * 
   * @param operation - Operation to execute
   * @param fallback - Fallback function
   * @returns Circuit result
   */
  execute<T>(operation: () => T | Promise<T>, fallback?: FallbackFunction<T>): Promise<CircuitResult<T>>;

  /**
   * Gets current circuit state
   * 
   * @returns Current circuit state
   */
  getState(): CircuitState;

  /**
   * Gets circuit statistics
   * 
   * @returns Circuit statistics
   */
  getStats(): CircuitStats;

  /**
   * Resets circuit to closed state
   */
  reset(): void;

  /**
   * Sets circuit breaker configuration
   * 
   * @param config - Circuit configuration
   */
  setConfig(config: CircuitConfig): void;

  /**
   * Gets current circuit configuration
   * 
   * @returns Current circuit configuration
   */
  getConfig(): CircuitConfig;
}
