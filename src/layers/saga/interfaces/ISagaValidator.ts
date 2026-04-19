/**
 * Saga Validator Interface
 * 
 * Defines the contract for validating saga steps
 * in the Saga Layer.
 */

import { SagaStep } from '../types/saga-types';

export interface ValidationError {
  stepIndex: number;
  stepName: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export interface ISagaValidator {
  /**
   * Validates a single saga step
   * 
   * @param step - Saga step to validate
   * @param stepIndex - Index of the step
   * @returns Validation result
   */
  validateStep<T>(step: SagaStep<T>, stepIndex: number): ValidationResult;

  /**
   * Validates multiple saga steps
   * 
   * @param steps - Saga steps to validate
   * @returns Validation result
   */
  validateSteps<T>(steps: SagaStep<T>[]): ValidationResult;

  /**
   * Validates step name uniqueness
   * 
   * @param steps - Saga steps to validate
   * @returns Validation result
   */
  validateNameUniqueness<T>(steps: SagaStep<T>[]): ValidationResult;

  /**
   * Validates that step has required functions
   * 
   * @param step - Saga step to validate
   * @returns Validation result
   */
  validateStepFunctions<T>(step: SagaStep<T>): ValidationResult;

  /**
   * Gets the validator name
   * 
   * @returns Validator name
   */
  getValidatorName(): string;
}
