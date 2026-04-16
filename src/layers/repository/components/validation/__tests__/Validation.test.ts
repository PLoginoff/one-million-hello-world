/**
 * Validation Layer Tests
 * 
 * Comprehensive test suite for Validation implementation.
 * Tests validation rules, schema validation, custom validators, and statistics.
 */

import { Validation } from '../implementations/Validation';
import { IValidation } from '../interfaces/IValidation';
import {
  ValidationRule,
  ValidationSeverity,
} from '../types/validation-types';

interface TestEntity {
  name: string;
  age: number;
  email: string;
}

describe('Validation', () => {
  let validation: Validation<TestEntity>;

  beforeEach(() => {
    // Initialize Validation before each test
    validation = new Validation<TestEntity>();
  });

  describe('Initialization', () => {
    /**
     * Test that Validation initializes with default configuration
     */
    it('should initialize with default configuration', () => {
      const config = validation.getConfig();
      expect(config.stopOnFirstError).toBe(false);
      expect(config.defaultSeverity).toBe(ValidationSeverity.ERROR);
    });

    /**
     * Test that stats are initialized to zero
     */
    it('should initialize stats to zero', () => {
      const stats = validation.getStats();
      expect(stats.totalValidations).toBe(0);
      expect(stats.failedValidations).toBe(0);
    });
  });

  describe('Rule Registration', () => {
    /**
     * Test adding a validation rule
     */
    it('should add a validation rule successfully', () => {
      const rule: ValidationRule<TestEntity> = {
        field: 'name',
        validator: (value) => value.length > 0,
        message: 'Name is required',
      };

      validation.addRule(rule);
      const rules = validation.getRules();

      expect(rules.length).toBe(1);
    });

    /**
     * Test adding multiple validation rules
     */
    it('should add multiple validation rules successfully', () => {
      const rules: ValidationRule<TestEntity>[] = [
        {
          field: 'name',
          validator: (value) => value.length > 0,
          message: 'Name is required',
        },
        {
          field: 'age',
          validator: (value) => value >= 18,
          message: 'Age must be 18 or older',
        },
      ];

      validation.addRules(rules);
      const registeredRules = validation.getRules();

      expect(registeredRules.length).toBe(2);
    });
  });

  describe('Entity Validation', () => {
    /**
     * Test validating a valid entity
     */
    it('should validate a valid entity successfully', () => {
      const rule: ValidationRule<TestEntity> = {
        field: 'name',
        validator: (value) => value.length > 0,
        message: 'Name is required',
      };

      validation.addRule(rule);

      const entity: TestEntity = {
        name: 'John',
        age: 30,
        email: 'john@example.com',
      };

      const result = validation.validate(entity);

      expect(result.success).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    /**
     * Test validating an invalid entity
     */
    it('should fail validation for invalid entity', () => {
      const rule: ValidationRule<TestEntity> = {
        field: 'name',
        validator: (value) => value.length > 0,
        message: 'Name is required',
      };

      validation.addRule(rule);

      const entity: TestEntity = {
        name: '',
        age: 30,
        email: 'john@example.com',
      };

      const result = validation.validate(entity);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBe(1);
    });

    /**
     * Test validating with multiple rules
     */
    it('should validate with multiple rules', () => {
      const rules: ValidationRule<TestEntity>[] = [
        {
          field: 'name',
          validator: (value) => value.length > 0,
          message: 'Name is required',
        },
        {
          field: 'age',
          validator: (value) => value >= 18,
          message: 'Age must be 18 or older',
        },
      ];

      validation.addRules(rules);

      const entity: TestEntity = {
        name: '',
        age: 15,
        email: 'john@example.com',
      };

      const result = validation.validate(entity);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBe(2);
    });
  });

  describe('Field Validation', () => {
    /**
     * Test validating a specific field
     */
    it('should validate a specific field successfully', () => {
      const rule: ValidationRule<TestEntity> = {
        field: 'name',
        validator: (value) => value.length > 0,
        message: 'Name is required',
      };

      validation.addRule(rule);

      const result = validation.validateField('name', 'John');

      expect(result.success).toBe(true);
    });

    /**
     * Test validating a specific field with invalid value
     */
    it('should fail validation for invalid field value', () => {
      const rule: ValidationRule<TestEntity> = {
        field: 'name',
        validator: (value) => value.length > 0,
        message: 'Name is required',
      };

      validation.addRule(rule);

      const result = validation.validateField('name', '');

      expect(result.success).toBe(false);
    });
  });

  describe('Custom Validators', () => {
    /**
     * Test using a custom validator
     */
    it('should use custom validator successfully', () => {
      const customValidator = (value: string) => /^[a-zA-Z]+$/.test(value);

      const rule: ValidationRule<TestEntity> = {
        field: 'name',
        validator: customValidator,
        message: 'Name must contain only letters',
      };

      validation.addRule(rule);

      const result = validation.validateField('name', 'John123');

      expect(result.success).toBe(false);
    });
  });

  describe('Statistics', () => {
    /**
     * Test stats track total validations
     */
    it('should track total validations', () => {
      const rule: ValidationRule<TestEntity> = {
        field: 'name',
        validator: (value) => value.length > 0,
        message: 'Name is required',
      };

      validation.addRule(rule);

      const entity: TestEntity = {
        name: 'John',
        age: 30,
        email: 'john@example.com',
      };

      validation.validate(entity);
      validation.validate(entity);

      const stats = validation.getStats();
      expect(stats.totalValidations).toBe(2);
    });

    /**
     * Test stats track failed validations
     */
    it('should track failed validations', () => {
      const rule: ValidationRule<TestEntity> = {
        field: 'name',
        validator: (value) => value.length > 0,
        message: 'Name is required',
      };

      validation.addRule(rule);

      const entity: TestEntity = {
        name: '',
        age: 30,
        email: 'john@example.com',
      };

      validation.validate(entity);

      const stats = validation.getStats();
      expect(stats.failedValidations).toBe(1);
    });

    /**
     * Test reset stats
     */
    it('should reset stats', () => {
      const rule: ValidationRule<TestEntity> = {
        field: 'name',
        validator: (value) => value.length > 0,
        message: 'Name is required',
      };

      validation.addRule(rule);

      const entity: TestEntity = {
        name: 'John',
        age: 30,
        email: 'john@example.com',
      };

      validation.validate(entity);
      validation.resetStats();

      const stats = validation.getStats();
      expect(stats.totalValidations).toBe(0);
    });
  });

  describe('Configuration', () => {
    /**
     * Test updating configuration
     */
    it('should update configuration', () => {
      const newConfig = {
        stopOnFirstError: true,
        defaultSeverity: ValidationSeverity.WARNING,
      };

      validation.setConfig(newConfig);
      const config = validation.getConfig();

      expect(config.stopOnFirstError).toBe(true);
      expect(config.defaultSeverity).toBe(ValidationSeverity.WARNING);
    });
  });

  describe('Rule Removal', () => {
    /**
     * Test removing a validation rule
     */
    it('should remove a validation rule successfully', () => {
      const rule: ValidationRule<TestEntity> = {
        field: 'name',
        validator: (value) => value.length > 0,
        message: 'Name is required',
      };

      validation.addRule(rule);
      validation.removeRule('name');

      const rules = validation.getRules();
      expect(rules.length).toBe(0);
    });

    /**
     * Test clearing all rules
     */
    it('should clear all rules successfully', () => {
      const rules: ValidationRule<TestEntity>[] = [
        {
          field: 'name',
          validator: (value) => value.length > 0,
          message: 'Name is required',
        },
        {
          field: 'age',
          validator: (value) => value >= 18,
          message: 'Age must be 18 or older',
        },
      ];

      validation.addRules(rules);
      validation.clearRules();

      const registeredRules = validation.getRules();
      expect(registeredRules.length).toBe(0);
    });
  });
});
