/**
 * Validation Strategy Interface
 * 
 * Defines contract for different validation strategies.
 */

import { ValidationResultEntity } from '../../domain/entities/ValidationResultEntity';

export interface IValidationStrategy {
  /**
   * Get strategy name
   */
  getName(): string;

  /**
   * Validate value
   */
  validate(value: any, context?: any): ValidationResultEntity;
}
