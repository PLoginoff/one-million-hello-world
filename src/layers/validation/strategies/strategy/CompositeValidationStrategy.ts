/**
 * Composite Validation Strategy
 *
 * Combines multiple validation strategies and aggregates results.
 */

import { IValidationStrategy } from './IValidationStrategy';
import { ValidationResultEntity } from '../../domain/entities/ValidationResultEntity';

export class CompositeValidationStrategy implements IValidationStrategy {
  private readonly _strategies: IValidationStrategy[];

  constructor(strategies: IValidationStrategy[] = []) {
    this._strategies = strategies;
  }

  getName(): string {
    return 'COMPOSITE_VALIDATION';
  }

  addStrategy(strategy: IValidationStrategy): CompositeValidationStrategy {
    return new CompositeValidationStrategy([...this._strategies, strategy]);
  }

  validate(value: unknown, context?: unknown): ValidationResultEntity {
    let result = ValidationResultEntity.success();

    for (const strategy of this._strategies) {
      const subResult = strategy.validate(value, context);
      if (!subResult.data.valid) {
        for (const error of subResult.data.errors) {
          result = result.addError(error.field, error.message);
        }
      }
    }

    return result;
  }

  getStrategies(): IValidationStrategy[] {
    return [...this._strategies];
  }
}
