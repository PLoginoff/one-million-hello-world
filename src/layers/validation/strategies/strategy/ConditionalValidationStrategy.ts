/**
 * Conditional Validation Strategy
 *
 * Applies validation only when a condition predicate returns true.
 */

import { IValidationStrategy } from './IValidationStrategy';
import { ValidationResultEntity } from '../../domain/entities/ValidationResultEntity';

export type ConditionPredicate = (value: unknown, context?: unknown) => boolean;

export class ConditionalValidationStrategy implements IValidationStrategy {
  private readonly _inner: IValidationStrategy;
  private readonly _condition: ConditionPredicate;

  constructor(inner: IValidationStrategy, condition: ConditionPredicate) {
    this._inner = inner;
    this._condition = condition;
  }

  getName(): string {
    return `CONDITIONAL(${this._inner.getName()})`;
  }

  validate(value: unknown, context?: unknown): ValidationResultEntity {
    if (this._condition(value, context)) {
      return this._inner.validate(value, context);
    }
    return ValidationResultEntity.success();
  }
}
