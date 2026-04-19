/**
 * Conditional Validator
 * 
 * Validator that validates only when a condition is met.
 */

import { IValidator, ValidationResult } from './IValidator';
import { BaseValidator } from './BaseValidator';

export type ValidationCondition = (data: unknown) => boolean;

export class ConditionalValidator extends BaseValidator {
  private _validator: IValidator;
  private _condition: ValidationCondition;
  private _invertCondition: boolean;

  constructor(
    name: string,
    validator: IValidator,
    condition: ValidationCondition,
    invertCondition: boolean = false
  ) {
    super(name);
    this._validator = validator;
    this._condition = condition;
    this._invertCondition = invertCondition;
  }

  validate(data: unknown): ValidationResult {
    const shouldValidate = this._invertCondition 
      ? !this._condition(data)
      : this._condition(data);

    if (!shouldValidate) {
      return this._success();
    }

    return this._validator.validate(data);
  }

  /**
   * Gets the inner validator
   * 
   * @returns Inner validator
   */
  getValidator(): IValidator {
    return this._validator;
  }

  /**
   * Sets the inner validator
   * 
   * @param validator - New validator
   * @returns This validator for chaining
   */
  setValidator(validator: IValidator): ConditionalValidator {
    this._validator = validator;
    return this;
  }

  /**
   * Gets the condition
   * 
   * @returns Condition function
   */
  getCondition(): ValidationCondition {
    return this._condition;
  }

  /**
   * Sets the condition
   * 
   * @param condition - New condition
   * @returns This validator for chaining
   */
  setCondition(condition: ValidationCondition): ConditionalValidator {
    this._condition = condition;
    return this;
  }

  /**
   * Checks if condition is inverted
   * 
   * @returns True if inverted
   */
  isInverted(): boolean {
    return this._invertCondition;
  }

  /**
   * Sets whether to invert the condition
   * 
   * @param invert - Invert flag
   * @returns This validator for chaining
   */
  setInverted(invert: boolean): ConditionalValidator {
    this._invertCondition = invert;
    return this;
  }
}
