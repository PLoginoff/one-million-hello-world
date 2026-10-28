/**
 * Validation Strategy Interface
 *
 * Defines the contract for validation execution strategies.
 * Strategies encapsulate different validation algorithms and behaviors.
 *
 * @module ValidationLayer/Strategies
 */

import { ValidationContext, ValidationSchema } from '../types/validation-types';

/**
 * Context passed to validation strategies during execution.
 */
export interface ValidationStrategyContext {
  /** Data to validate */
  readonly data: Record<string, unknown>;
  /** Validation schema */
  readonly schema: ValidationSchema;
  /** Validation context (request info, user, etc.) */
  readonly context: ValidationContext;
  /** Whether to sanitize data during validation */
  readonly sanitize: boolean;
  /** Whether to enable async validation */
  readonly enableAsyncValidation: boolean;
  /** Whether to enable cross-field validation */
  readonly enableCrossFieldValidation: boolean;
  /** Whether to enable conditional validation */
  readonly enableConditionalValidation: boolean;
  /** Maximum validation time in milliseconds */
  readonly maxValidationTime: number;
}

/**
 * Result of a validation strategy execution.
 */
export interface ValidationStrategyResult {
  /** Whether the validation was successful */
  readonly success: boolean;
  /** Validated (and optionally sanitized) data */
  readonly data?: Record<string, unknown>;
  /** Validation errors */
  readonly errors: Array<{
    readonly field: string;
    readonly code: string;
    readonly message: string;
    readonly value?: unknown;
    readonly severity: 'ERROR' | 'WARNING' | 'INFO';
    readonly path?: string;
  }>;
  /** Validation warnings */
  readonly warnings: Array<{
    readonly field: string;
    readonly code: string;
    readonly message: string;
    readonly value?: unknown;
    readonly severity: 'ERROR' | 'WARNING' | 'INFO';
    readonly path?: string;
  }>;
  /** Error information if validation failed catastrophically */
  readonly error?: {
    readonly code: string;
    readonly message: string;
  };
  /** Execution metadata */
  readonly metadata?: {
    readonly strategyName: string;
    readonly executionTimeMs: number;
    readonly fieldsValidated: number;
    readonly fieldsPassed: number;
    readonly fieldsFailed: number;
    readonly fieldsSkipped: number;
    readonly sanitizationDurationMs: number;
  };
}

/**
 * Interface for validation execution strategies.
 *
 * Implementations provide different validation algorithms
 * (strict, lenient, streaming, etc.) and can be composed
 * with decorators for logging, metrics, caching, etc.
 */
export interface IValidationStrategy {
  /** Unique name identifying this strategy */
  readonly name: string;
  /** Priority for strategy selection (higher = preferred) */
  readonly priority: number;

  /**
   * Execute the validation strategy.
   *
   * @param context - The validation context containing data and schema
   * @returns Promise resolving to the validation result
   */
  execute(context: ValidationStrategyContext): Promise<ValidationStrategyResult>;

  /**
   * Determine if this strategy can handle the given context.
   *
   * @param context - The validation context to evaluate
   * @returns True if this strategy can handle the context
   */
  canHandle(context: ValidationStrategyContext): boolean;
}
