/**
 * Validator Factory
 * 
 * Factory for creating validators.
 */

import { IValidatorFactory } from './IValidatorFactory';
import { IValidator } from '../validation/IValidator';
import { TypeValidator } from '../validation/TypeValidator';
import { SchemaValidator } from '../validation/SchemaValidator';

export class ValidatorFactory implements IValidatorFactory {
  private _validators: Map<string, (config?: Record<string, unknown>) => IValidator>;

  constructor() {
    this._validators = new Map();
    this._registerDefaultValidators();
  }

  createValidator(name: string, config?: Record<string, unknown>): IValidator {
    const factory = this._validators.get(name);
    if (!factory) {
      throw new Error(`Validator not found: ${name}`);
    }
    return factory(config);
  }

  registerValidator(name: string, factory: (config?: Record<string, unknown>) => IValidator): void {
    this._validators.set(name, factory);
  }

  hasValidator(name: string): boolean {
    return this._validators.has(name);
  }

  getValidatorNames(): string[] {
    return Array.from(this._validators.keys());
  }

  /**
   * Unregisters a validator
   * 
   * @param name - Validator name
   */
  unregisterValidator(name: string): void {
    this._validators.delete(name);
  }

  /**
   * Clears all registered validators
   */
  clearValidators(): void {
    this._validators.clear();
  }

  private _registerDefaultValidators(): void {
    this._validators.set('type', (config?: Record<string, unknown>) => {
      const expectedType = config?.expectedType as string ?? 'object';
      return new TypeValidator(expectedType);
    });

    this._validators.set('schema', (config?: Record<string, unknown>) => {
      const schema = config?.schema as Record<string, unknown>;
      if (!schema) {
        throw new Error('Schema is required for SchemaValidator');
      }
      return new SchemaValidator(schema);
    });
  }
}
