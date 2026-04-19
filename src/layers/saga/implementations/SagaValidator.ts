/**
 * Saga Validator Implementation
 * 
 * Concrete implementation of ISagaValidator.
 * Validates saga steps for correctness.
 */

import { ISagaValidator, ValidationError, ValidationResult } from '../interfaces/ISagaValidator';
import { SagaStep } from '../types/saga-types';
import { ILogger } from '../interfaces/ILogger';

export class SagaValidator implements ISagaValidator {
  private readonly _logger: ILogger;

  constructor(logger: ILogger) {
    this._logger = logger;
  }

  validateStep<T>(step: SagaStep<T>, stepIndex: number): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    if (!step.name || step.name.trim() === '') {
      errors.push({
        stepIndex,
        stepName: step.name || '(unnamed)',
        message: 'Step name is required',
        severity: 'error',
      });
    }

    if (typeof step.execute !== 'function') {
      errors.push({
        stepIndex,
        stepName: step.name,
        message: 'Step must have an execute function',
        severity: 'error',
      });
    }

    if (typeof step.compensate !== 'function') {
      errors.push({
        stepIndex,
        stepName: step.name,
        message: 'Step must have a compensate function',
        severity: 'error',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  validateSteps<T>(steps: SagaStep<T>[]): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    for (let i = 0; i < steps.length; i++) {
      const result = this.validateStep(steps[i], i);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }

    const nameUniquenessResult = this.validateNameUniqueness(steps);
    errors.push(...nameUniquenessResult.errors);
    warnings.push(...nameUniquenessResult.warnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  validateNameUniqueness<T>(steps: SagaStep<T>[]): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    const nameMap = new Map<string, number[]>();

    for (let i = 0; i < steps.length; i++) {
      const name = steps[i].name;
      const indices = nameMap.get(name) || [];
      indices.push(i);
      nameMap.set(name, indices);
    }

    for (const [name, indices] of nameMap) {
      if (indices.length > 1) {
        for (const index of indices) {
          errors.push({
            stepIndex: index,
            stepName: name,
            message: `Duplicate step name: ${name}`,
            severity: 'error',
          });
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  validateStepFunctions<T>(step: SagaStep<T>): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    if (typeof step.execute !== 'function') {
      errors.push({
        stepIndex: -1,
        stepName: step.name,
        message: 'Step must have an execute function',
        severity: 'error',
      });
    }

    if (typeof step.compensate !== 'function') {
      errors.push({
        stepIndex: -1,
        stepName: step.name,
        message: 'Step must have a compensate function',
        severity: 'error',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  getValidatorName(): string {
    return 'DefaultSagaValidator';
  }
}
