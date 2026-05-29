/**
 * Circuit Breaker Fallback Strategies
 * 
 * Exports all fallback strategy implementations.
 */

export { IFallbackStrategy, FallbackContext, FallbackResult } from './IFallbackStrategy';
export { DefaultFallbackStrategy } from './DefaultFallbackStrategy';
export { CacheFallbackStrategy, CacheFallbackOptions } from './CacheFallbackStrategy';
export { DefaultValueFallbackStrategy } from './DefaultValueFallbackStrategy';
