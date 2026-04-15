/**
 * Circuit Breaker Layer Types
 * 
 * This module defines all type definitions for the Circuit Breaker Layer,
 * including fault tolerance and fallback strategies.
 */

/**
 * Circuit breaker state
 */
export enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open',
}

/**
 * Circuit breaker statistics
 */
export interface CircuitStats {
  failureCount: number;
  successCount: number;
  lastFailureTime: number;
  state: CircuitState;
}

/**
 * Circuit breaker configuration
 */
export interface CircuitConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  resetTimeout: number;
}

/**
 * Circuit breaker result
 */
export interface CircuitResult<T> {
  success: boolean;
  data?: T;
  state: CircuitState;
  error?: string;
}
