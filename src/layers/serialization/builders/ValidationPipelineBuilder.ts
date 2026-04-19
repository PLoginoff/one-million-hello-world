/**
 * Validation Pipeline Builder
 * 
 * Fluent builder for creating configured ValidationPipeline instances.
 */

import { ValidationPipeline } from '../validation/ValidationPipeline';
import { IValidator } from '../validation/IValidator';

export class ValidationPipelineBuilder {
  private _validators: IValidator[];
  private _enabled: boolean;

  constructor() {
    this._validators = [];
    this._enabled = true;
  }

  /**
   * Adds a validator to the pipeline
   * 
   * @param validator - Validator instance
   * @returns This builder for chaining
   */
  withValidator(validator: IValidator): ValidationPipelineBuilder {
    this._validators.push(validator);
    return this;
  }

  /**
   * Adds multiple validators to the pipeline
   * 
   * @param validators - Array of validators
   * @returns This builder for chaining
   */
  withValidators(validators: IValidator[]): ValidationPipelineBuilder {
    this._validators.push(...validators);
    return this;
  }

  /**
   * Enables or disables the pipeline
   * 
   * @param enabled - Enable flag
   * @returns This builder for chaining
   */
  withEnabled(enabled: boolean): ValidationPipelineBuilder {
    this._enabled = enabled;
    return this;
  }

  /**
   * Adds validators only if condition is true
   * 
   * @param condition - Condition to check
   * @param validators - Validators to add if condition is true
   * @returns This builder for chaining
   */
  withValidatorsIf(condition: boolean, validators: IValidator[]): ValidationPipelineBuilder {
    if (condition) {
      this._validators.push(...validators);
    }
    return this;
  }

  /**
   * Builds the ValidationPipeline instance
   * 
   * @returns Configured ValidationPipeline instance
   */
  build(): ValidationPipeline {
    const pipeline = new ValidationPipeline();
    
    for (const validator of this._validators) {
      if (validator instanceof Object && 'setEnabled' in validator) {
        (validator as any).setEnabled(this._enabled);
      }
      pipeline.addValidator(validator);
    }

    return pipeline;
  }

  /**
   * Resets the builder to default state
   * 
   * @returns This builder for chaining
   */
  reset(): ValidationPipelineBuilder {
    this._validators = [];
    this._enabled = true;
    return this;
  }

  /**
   * Gets the current validator count
   * 
   * @returns Number of validators
   */
  getValidatorCount(): number {
    return this._validators.length;
  }
}
