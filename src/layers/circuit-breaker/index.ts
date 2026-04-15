/**
 * Circuit Breaker Layer
 * 
 * This module exports all public interfaces, implementations, and types
 * for the Circuit Breaker Layer (Layer 18 of the 25-layer architecture).
 * 
 * The Circuit Breaker Layer provides fault tolerance
 * and fallback strategies.
 * 
 * @module CircuitBreakerLayer
 */

export { ICircuitBreaker, FallbackFunction } from './interfaces/ICircuitBreaker';
export { CircuitBreaker } from './implementations/CircuitBreaker';
export * from './types/circuit-breaker-types';
