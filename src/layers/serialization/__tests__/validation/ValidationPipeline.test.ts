/**
 * Validation Pipeline Unit Tests
 */

import { ValidationPipeline } from '../../validation/ValidationPipeline';
import { TypeValidator } from '../../validation/TypeValidator';
import { SchemaValidator, Schema } from '../../validation/SchemaValidator';

describe('ValidationPipeline', () => {
  let pipeline: ValidationPipeline;

  beforeEach(() => {
    pipeline = new ValidationPipeline();
  });

  describe('addValidator', () => {
    it('should add validator to pipeline', () => {
      const validator = new TypeValidator('object');
      pipeline.addValidator(validator);

      expect(pipeline.getValidatorCount()).toBe(1);
    });

    it('should add multiple validators', () => {
      const validator1 = new TypeValidator('object');
      const validator2 = new TypeValidator('string');
      
      pipeline.addValidator(validator1);
      pipeline.addValidator(validator2);

      expect(pipeline.getValidatorCount()).toBe(2);
    });
  });

  describe('removeValidator', () => {
    it('should remove validator from pipeline', () => {
      const validator = new TypeValidator('object');
      pipeline.addValidator(validator);
      pipeline.removeValidator(validator);

      expect(pipeline.getValidatorCount()).toBe(0);
    });
  });

  describe('clearValidators', () => {
    it('should remove all validators', () => {
      const validator1 = new TypeValidator('object');
      const validator2 = new TypeValidator('string');
      
      pipeline.addValidator(validator1);
      pipeline.addValidator(validator2);
      pipeline.clearValidators();

      expect(pipeline.getValidatorCount()).toBe(0);
    });
  });

  describe('validate', () => {
    it('should pass validation with no validators', () => {
      const result = pipeline.validate({ message: 'Hello' });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should pass validation with valid data', () => {
      const validator = new TypeValidator('object');
      pipeline.addValidator(validator);

      const result = pipeline.validate({ message: 'Hello' });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation with invalid data', () => {
      const validator = new TypeValidator('object');
      pipeline.addValidator(validator);

      const result = pipeline.validate('not an object');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should collect errors from multiple validators', () => {
      const typeValidator = new TypeValidator('object');
      const schema: Schema = {
        type: 'object',
        required: ['name'],
      };
      const schemaValidator = new SchemaValidator(schema);

      pipeline.addValidator(typeValidator);
      pipeline.addValidator(schemaValidator);

      const result = pipeline.validate({});

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should collect warnings from validators', () => {
      const validator = new TypeValidator('object');
      pipeline.addValidator(validator);

      const result = pipeline.validate(null);

      expect(result.valid).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should return all validators', () => {
      const validator1 = new TypeValidator('object');
      const validator2 = new TypeValidator('string');
      
      pipeline.addValidator(validator1);
      pipeline.addValidator(validator2);

      const validators = pipeline.getValidators();

      expect(validators).toHaveLength(2);
      expect(validators).toContain(validator1);
      expect(validators).toContain(validator2);
    });

    it('should return validator count', () => {
      expect(pipeline.getValidatorCount()).toBe(0);

      pipeline.addValidator(new TypeValidator('object'));
      expect(pipeline.getValidatorCount()).toBe(1);

      pipeline.addValidator(new TypeValidator('string'));
      expect(pipeline.getValidatorCount()).toBe(2);
    });
  });
});
