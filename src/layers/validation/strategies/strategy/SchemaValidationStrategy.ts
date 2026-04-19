/**
 * Schema Validation Strategy
 * 
 * Implements schema-based validation strategy.
 */

import { IValidationStrategy } from './IValidationStrategy';
import { ValidationResultEntity } from '../../domain/entities/ValidationResultEntity';
import { SchemaValidationService, ValidationSchema } from '../../domain/services/SchemaValidationService';

export class SchemaValidationStrategy implements IValidationStrategy {
  private schema: ValidationSchema;

  constructor(schema: ValidationSchema) {
    this.schema = schema;
  }

  getName(): string {
    return 'SCHEMA_VALIDATION';
  }

  validate(value: any): ValidationResultEntity {
    const result = SchemaValidationService.validate(value, this.schema);
    
    if (result.valid) {
      return ValidationResultEntity.success();
    } else {
      return ValidationResultEntity.failure(result.errors);
    }
  }

  /**
   * Update schema
   */
  updateSchema(schema: ValidationSchema): void {
    this.schema = schema;
  }

  /**
   * Get current schema
   */
  getSchema(): ValidationSchema {
    return this.schema;
  }
}
