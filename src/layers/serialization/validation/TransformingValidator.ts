/**
 * Transforming Validator
 * 
 * Validator that transforms data before validation.
 */

import { IValidator, ValidationResult } from './IValidator';
import { BaseValidator } from './BaseValidator';

export type TransformFunction = (data: unknown) => unknown;

export class TransformingValidator extends BaseValidator {
  private _validator: IValidator;
  private _transform: TransformFunction;
  private _preserveOriginal: boolean;

  constructor(
    name: string,
    validator: IValidator,
    transform: TransformFunction,
    preserveOriginal: boolean = false
  ) {
    super(name);
    this._validator = validator;
    this._transform = transform;
    this._preserveOriginal = preserveOriginal;
  }

  validate(data: unknown): ValidationResult {
    try {
      const transformed = this._transform(data);
      return this._validator.validate(transformed);
    } catch (error) {
      return this._failure([
        `Transform error: ${error instanceof Error ? error.message : String(error)}`
      ]);
    }
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
  setValidator(validator: IValidator): TransformingValidator {
    this._validator = validator;
    return this;
  }

  /**
   * Gets the transform function
   * 
   * @returns Transform function
   */
  getTransform(): TransformFunction {
    return this._transform;
  }

  /**
   * Sets the transform function
   * 
   * @param transform - New transform function
   * @returns This validator for chaining
   */
  setTransform(transform: TransformFunction): TransformingValidator {
    this._transform = transform;
    return this;
  }

  /**
   * Checks if original data should be preserved
   * 
   * @returns True if preserving original
   */
  isPreservingOriginal(): boolean {
    return this._preserveOriginal;
  }

  /**
   * Sets whether to preserve original data
   * 
   * @param preserve - Preserve flag
   * @returns This validator for chaining
   */
  setPreserveOriginal(preserve: boolean): TransformingValidator {
    this._preserveOriginal = preserve;
    return this;
  }
}
