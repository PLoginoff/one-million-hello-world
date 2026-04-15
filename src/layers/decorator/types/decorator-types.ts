/**
 * Decorator Layer Types
 * 
 * This module defines all type definitions for the Decorator Layer,
 * including runtime decoration and cross-cutting concerns.
 */

/**
 * Decorator result
 */
export interface DecoratorResult<T> {
  success: boolean;
  data?: T;
  decorators: string[];
  error?: string;
}

/**
 * Decorator configuration
 */
export interface DecoratorConfig {
  enableLogging: boolean;
  enableMetrics: boolean;
}
