/**
 * Validation Engine Layer Tests
 * 
 * Comprehensive test suite for ValidationEngine implementation.
 * Tests validation rules, schema validation, custom validators, and statistics.
 */

import { ValidationEngine } from '../implementations/ValidationEngine';
import { IValidationEngine } from '../interfaces/IValidationEngine';
import {
  ValidationRule,
  ValidationSeverity,
  ValidationCategory,
  SchemaDefinition,
  FieldDefinition,
  FieldType,
} from '../types/validation-types';

interface TestEntity {
  name: string;
  age: number;
  email: string;
}

describe('ValidationEngine', () => {
  let validationEngine: ValidationEngine;

  beforeEach(() => {
    validationEngine = new ValidationEngine();
  });

  describe('Initialization', () => {
    /**
     * Test that ValidationEngine initializes with default configuration
     */
    it('should initialize with default configuration', () => {
      const config = validationEngine.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.failFast).toBe(false);
      expect(config.enableWarnings).toBe(true);
    });

    /**
     * Test that stats are initialized to zero
     */
    it('should initialize stats to zero', () => {
      const stats = validationEngine.getStats();
      expect(stats.totalValidations).toBe(0);
      expect(stats.successfulValidations).toBe(0);
      expect(stats.failedValidations).toBe(0);
      expect(stats.averageExecutionTime).toBe(0);
    });
  });

  describe('Entity Validation', () => {
    /**
     * Test validating a valid entity
     */
    it('should validate a valid entity successfully', () => {
      const rule: ValidationRule = {
        name: 'nameRequired',
        field: 'name',
        validator: (value) => (value as string).length > 0,
        errorMessage: 'Name is required',
        severity: ValidationSeverity.ERROR,
        category: ValidationCategory.REQUIRED,
      };

      const entity: TestEntity = {
        name: 'John',
        age: 30,
        email: 'john@example.com',
      };

      const result = validationEngine.validate(entity, [rule]);

      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    /**
     * Test validating an invalid entity
     */
    it('should fail validation for invalid entity', () => {
      const rule: ValidationRule = {
        name: 'nameRequired',
        field: 'name',
        validator: (value) => (value as string).length > 0,
        errorMessage: 'Name is required',
        severity: ValidationSeverity.ERROR,
        category: ValidationCategory.REQUIRED,
      };

      const entity: TestEntity = {
        name: '',
        age: 30,
        email: 'john@example.com',
      };

      const result = validationEngine.validate(entity, [rule]);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(1);
    });

    /**
     * Test validating with multiple rules
     */
    it('should validate with multiple rules', () => {
      const rules: ValidationRule[] = [
        {
          name: 'nameRequired',
          field: 'name',
          validator: (value) => (value as string).length > 0,
          errorMessage: 'Name is required',
          severity: ValidationSeverity.ERROR,
          category: ValidationCategory.REQUIRED,
        },
        {
          name: 'ageMinimum',
          field: 'age',
          validator: (value) => (value as number) >= 18,
          errorMessage: 'Age must be 18 or older',
          severity: ValidationSeverity.ERROR,
          category: ValidationCategory.RANGE,
        },
      ];

      const entity: TestEntity = {
        name: '',
        age: 15,
        email: 'john@example.com',
      };

      const result = validationEngine.validate(entity, rules);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(2);
    });

    /**
     * Test validation with disabled config
     */
    it('should return valid when validation is disabled', () => {
      validationEngine.setConfig({ enabled: false });

      const rule: ValidationRule = {
        name: 'nameRequired',
        field: 'name',
        validator: () => false,
        errorMessage: 'Name is required',
        severity: ValidationSeverity.ERROR,
        category: ValidationCategory.REQUIRED,
      };

      const entity: TestEntity = {
        name: '',
        age: 30,
        email: 'john@example.com',
      };

      const result = validationEngine.validate(entity, [rule]);

      expect(result.valid).toBe(true);
    });
  });

  describe('Field Validation', () => {
    /**
     * Test validating a specific field
     */
    it('should validate a specific field successfully', () => {
      const rule: ValidationRule = {
        name: 'nameRequired',
        field: 'name',
        validator: (value) => (value as string).length > 0,
        errorMessage: 'Name is required',
        severity: ValidationSeverity.ERROR,
        category: ValidationCategory.REQUIRED,
      };

      const context = validationEngine.createContext('name', {});
      const result = validationEngine.validateField('John', rule, context);

      expect(result.valid).toBe(true);
    });

    /**
     * Test validating a specific field with invalid value
     */
    it('should fail validation for invalid field value', () => {
      const rule: ValidationRule = {
        name: 'nameRequired',
        field: 'name',
        validator: (value) => (value as string).length > 0,
        errorMessage: 'Name is required',
        severity: ValidationSeverity.ERROR,
        category: ValidationCategory.REQUIRED,
      };

      const context = validationEngine.createContext('name', {});
      const result = validationEngine.validateField('', rule, context);

      expect(result.valid).toBe(false);
    });

    /**
     * Test field validation with warning severity
     */
    it('should return warning for warning severity', () => {
      const rule: ValidationRule = {
        name: 'nameLength',
        field: 'name',
        validator: (value) => (value as string).length >= 5,
        errorMessage: 'Name should be at least 5 characters',
        severity: ValidationSeverity.WARNING,
        category: ValidationCategory.LENGTH,
      };

      const context = validationEngine.createContext('name', {});
      const result = validationEngine.validateField('John', rule, context);

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBe(1);
    });
  });

  describe('Schema Validation', () => {
    /**
     * Test validating against schema
     */
    it('should validate entity against schema successfully', () => {
      const schema: SchemaDefinition = {
        fields: [
          {
            name: 'name',
            type: FieldType.STRING,
            required: true,
            nullable: false,
            rules: [],
          },
          {
            name: 'age',
            type: FieldType.NUMBER,
            required: true,
            nullable: false,
            rules: [],
          },
        ],
        globalRules: [],
      };

      const entity: TestEntity = {
        name: 'John',
        age: 30,
        email: 'john@example.com',
      };

      const result = validationEngine.validateSchema(entity, schema);

      expect(result.valid).toBe(true);
    });

    /**
     * Test schema validation with global rules
     */
    it('should apply global rules in schema validation', () => {
      const globalRule: ValidationRule = {
        name: 'ageMinimum',
        field: 'age',
        validator: (value) => (value as number) >= 18,
        errorMessage: 'Age must be 18 or older',
        severity: ValidationSeverity.ERROR,
        category: ValidationCategory.RANGE,
      };

      const schema: SchemaDefinition = {
        fields: [],
        globalRules: [globalRule],
      };

      const entity: TestEntity = {
        name: 'John',
        age: 15,
        email: 'john@example.com',
      };

      const result = validationEngine.validateSchema(entity, schema);

      expect(result.valid).toBe(false);
    });
  });

  describe('Custom Validators', () => {
    /**
     * Test registering a custom validator
     */
    it('should register a custom validator successfully', () => {
      const customValidator = (value: unknown) => /^[a-zA-Z]+$/.test(value as string);

      validationEngine.registerValidator('lettersOnly', customValidator);

      const validator = validationEngine.getValidator('lettersOnly');
      expect(validator).toBeDefined();
      expect(validator!('John')).toBe(true);
      expect(validator!('John123')).toBe(false);
    });

    /**
     * Test unregistering a custom validator
     */
    it('should unregister a custom validator successfully', () => {
      const customValidator = (value: unknown) => true;

      validationEngine.registerValidator('test', customValidator);
      validationEngine.unregisterValidator('test');

      const validator = validationEngine.getValidator('test');
      expect(validator).toBeUndefined();
    });

    /**
     * Test getting non-existent validator returns undefined
     */
    it('should return undefined for non-existent validator', () => {
      const validator = validationEngine.getValidator('nonExistent');
      expect(validator).toBeUndefined();
    });
  });

  describe('Rule Management', () => {
    /**
     * Test adding a validation rule
     */
    it('should add a validation rule successfully', () => {
      const rule: ValidationRule = {
        name: 'nameRequired',
        field: 'name',
        validator: (value) => (value as string).length > 0,
        errorMessage: 'Name is required',
        severity: ValidationSeverity.ERROR,
        category: ValidationCategory.REQUIRED,
      };

      validationEngine.addRule(rule);
      const rules = validationEngine.getRules();

      expect(rules.length).toBe(1);
    });

    /**
     * Test removing a validation rule
     */
    it('should remove a validation rule successfully', () => {
      const rule: ValidationRule = {
        name: 'nameRequired',
        field: 'name',
        validator: (value) => (value as string).length > 0,
        errorMessage: 'Name is required',
        severity: ValidationSeverity.ERROR,
        category: ValidationCategory.REQUIRED,
      };

      validationEngine.addRule(rule);
      validationEngine.removeRule('nameRequired');

      const rules = validationEngine.getRules();
      expect(rules.length).toBe(0);
    });

    /**
     * Test getting rules for a specific field
     */
    it('should return rules for specific field', () => {
      const rule1: ValidationRule = {
        name: 'nameRequired',
        field: 'name',
        validator: (value) => (value as string).length > 0,
        errorMessage: 'Name is required',
        severity: ValidationSeverity.ERROR,
        category: ValidationCategory.REQUIRED,
      };

      const rule2: ValidationRule = {
        name: 'ageMinimum',
        field: 'age',
        validator: (value) => (value as number) >= 18,
        errorMessage: 'Age must be 18 or older',
        severity: ValidationSeverity.ERROR,
        category: ValidationCategory.RANGE,
      };

      validationEngine.addRule(rule1);
      validationEngine.addRule(rule2);

      const nameRules = validationEngine.getRulesForField('name');
      expect(nameRules.length).toBe(1);
      expect(nameRules[0].field).toBe('name');
    });

    /**
     * Test clearing all rules
     */
    it('should clear all rules successfully', () => {
      const rule: ValidationRule = {
        name: 'nameRequired',
        field: 'name',
        validator: (value) => (value as string).length > 0,
        errorMessage: 'Name is required',
        severity: ValidationSeverity.ERROR,
        category: ValidationCategory.REQUIRED,
      };

      validationEngine.addRule(rule);
      validationEngine.clearRules();

      const rules = validationEngine.getRules();
      expect(rules.length).toBe(0);
    });
  });

  describe('Configuration', () => {
    /**
     * Test updating configuration
     */
    it('should update configuration', () => {
      const newConfig = {
        enabled: false,
        failFast: true,
        enableWarnings: false,
      };

      validationEngine.setConfig(newConfig);
      const config = validationEngine.getConfig();

      expect(config.enabled).toBe(false);
      expect(config.failFast).toBe(true);
      expect(config.enableWarnings).toBe(false);
    });

    /**
     * Test partial config update
     */
    it('should update partial configuration', () => {
      validationEngine.setConfig({ failFast: true });
      const config = validationEngine.getConfig();

      expect(config.failFast).toBe(true);
      expect(config.enabled).toBe(true);
    });
  });

  describe('Statistics', () => {
    /**
     * Test stats track total validations
     */
    it('should track total validations', () => {
      const rule: ValidationRule = {
        name: 'nameRequired',
        field: 'name',
        validator: (value) => (value as string).length > 0,
        errorMessage: 'Name is required',
        severity: ValidationSeverity.ERROR,
        category: ValidationCategory.REQUIRED,
      };

      const entity: TestEntity = {
        name: 'John',
        age: 30,
        email: 'john@example.com',
      };

      validationEngine.validate(entity, [rule]);
      validationEngine.validate(entity, [rule]);

      const stats = validationEngine.getStats();
      expect(stats.totalValidations).toBe(2);
    });

    /**
     * Test stats track successful validations
     */
    it('should track successful validations', () => {
      const rule: ValidationRule = {
        name: 'nameRequired',
        field: 'name',
        validator: (value) => (value as string).length > 0,
        errorMessage: 'Name is required',
        severity: ValidationSeverity.ERROR,
        category: ValidationCategory.REQUIRED,
      };

      const entity: TestEntity = {
        name: 'John',
        age: 30,
        email: 'john@example.com',
      };

      validationEngine.validate(entity, [rule]);

      const stats = validationEngine.getStats();
      expect(stats.successfulValidations).toBe(1);
    });

    /**
     * Test stats track failed validations
     */
    it('should track failed validations', () => {
      const rule: ValidationRule = {
        name: 'nameRequired',
        field: 'name',
        validator: (value) => (value as string).length > 0,
        errorMessage: 'Name is required',
        severity: ValidationSeverity.ERROR,
        category: ValidationCategory.REQUIRED,
      };

      const entity: TestEntity = {
        name: '',
        age: 30,
        email: 'john@example.com',
      };

      validationEngine.validate(entity, [rule]);

      const stats = validationEngine.getStats();
      expect(stats.failedValidations).toBe(1);
    });

    /**
     * Test stats track rule execution counts
     */
    it('should track rule execution counts', () => {
      const rule: ValidationRule = {
        name: 'nameRequired',
        field: 'name',
        validator: (value) => (value as string).length > 0,
        errorMessage: 'Name is required',
        severity: ValidationSeverity.ERROR,
        category: ValidationCategory.REQUIRED,
      };

      const entity: TestEntity = {
        name: 'John',
        age: 30,
        email: 'john@example.com',
      };

      validationEngine.validate(entity, [rule]);
      validationEngine.validate(entity, [rule]);

      const stats = validationEngine.getStats();
      expect(stats.ruleExecutionCounts.get('nameRequired')).toBe(2);
    });

    /**
     * Test reset stats
     */
    it('should reset stats', () => {
      const rule: ValidationRule = {
        name: 'nameRequired',
        field: 'name',
        validator: (value) => (value as string).length > 0,
        errorMessage: 'Name is required',
        severity: ValidationSeverity.ERROR,
        category: ValidationCategory.REQUIRED,
      };

      const entity: TestEntity = {
        name: 'John',
        age: 30,
        email: 'john@example.com',
      };

      validationEngine.validate(entity, [rule]);
      validationEngine.resetStats();

      const stats = validationEngine.getStats();
      expect(stats.totalValidations).toBe(0);
      expect(stats.successfulValidations).toBe(0);
      expect(stats.failedValidations).toBe(0);
    });
  });

  describe('Validation Context', () => {
    /**
     * Test creating validation context
     */
    it('should create validation context successfully', () => {
      const entity: TestEntity = {
        name: 'John',
        age: 30,
        email: 'john@example.com',
      };

      const context = validationEngine.createContext('name', entity, { test: 'value' });

      expect(context.fieldName).toBe('name');
      expect(context.entity).toEqual(entity);
      expect(context.metadata.test).toBe('value');
    });
  });

  describe('Required Fields Validation', () => {
    /**
     * Test validating required fields
     */
    it('should validate required fields successfully', () => {
      const entity: TestEntity = {
        name: 'John',
        age: 30,
        email: 'john@example.com',
      };

      const result = validationEngine.validateRequired(entity, ['name', 'age']);

      expect(result.valid).toBe(true);
    });

    /**
     * Test fail validation when required field is missing
     */
    it('should fail validation when required field is missing', () => {
      const entity: TestEntity = {
        name: 'John',
        age: 30,
        email: 'john@example.com',
      };

      const result = validationEngine.validateRequired(entity, ['name', 'age', 'address']);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(1);
    });
  });

  describe('Field Type Validation', () => {
    /**
     * Test validating field types
     */
    it('should validate field types successfully', () => {
      const entity: TestEntity = {
        name: 'John',
        age: 30,
        email: 'john@example.com',
      };

      const fieldTypes = new Map<string, string>([
        ['name', 'string'],
        ['age', 'number'],
      ]);

      const result = validationEngine.validateTypes(entity, fieldTypes);

      expect(result.valid).toBe(true);
    });

    /**
     * Test fail validation when type mismatch
     */
    it('should fail validation when type mismatch', () => {
      const entity: TestEntity = {
        name: 'John',
        age: 30,
        email: 'john@example.com',
      };

      const fieldTypes = new Map<string, string>([
        ['name', 'number'],
      ]);

      const result = validationEngine.validateTypes(entity, fieldTypes);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(1);
    });
  });

  describe('Clear Validators', () => {
    /**
     * Test clearing all custom validators
     */
    it('should clear all custom validators successfully', () => {
      validationEngine.registerValidator('test1', () => true);
      validationEngine.registerValidator('test2', () => true);

      validationEngine.clearValidators();

      expect(validationEngine.getValidator('test1')).toBeUndefined();
      expect(validationEngine.getValidator('test2')).toBeUndefined();
    });
  });

  describe('Reset', () => {
    /**
     * Test resetting validation engine
     */
    it('should reset validation engine to default state', () => {
      const rule: ValidationRule = {
        name: 'nameRequired',
        field: 'name',
        validator: (value) => (value as string).length > 0,
        errorMessage: 'Name is required',
        severity: ValidationSeverity.ERROR,
        category: ValidationCategory.REQUIRED,
      };

      validationEngine.addRule(rule);
      validationEngine.registerValidator('test', () => true);
      validationEngine.setConfig({ enabled: false });

      validationEngine.reset();

      expect(validationEngine.getRules().length).toBe(0);
      expect(validationEngine.getValidator('test')).toBeUndefined();
      expect(validationEngine.getConfig().enabled).toBe(true);
      expect(validationEngine.getStats().totalValidations).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    /**
     * Test validation with failFast enabled
     */
    it('should stop on first error when failFast is enabled', () => {
      validationEngine.setConfig({ failFast: true });

      const rules: ValidationRule[] = [
        {
          name: 'nameRequired',
          field: 'name',
          validator: () => false,
          errorMessage: 'Name is required',
          severity: ValidationSeverity.ERROR,
          category: ValidationCategory.REQUIRED,
        },
        {
          name: 'ageMinimum',
          field: 'age',
          validator: () => false,
          errorMessage: 'Age must be 18 or older',
          severity: ValidationSeverity.ERROR,
          category: ValidationCategory.RANGE,
        },
      ];

      const entity: TestEntity = {
        name: '',
        age: 15,
        email: 'john@example.com',
      };

      const result = validationEngine.validate(entity, rules);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(1);
    });

    /**
     * Test validation with warnings disabled
     */
    it('should not include warnings when warnings are disabled', () => {
      validationEngine.setConfig({ enableWarnings: false });

      const rule: ValidationRule = {
        name: 'nameLength',
        field: 'name',
        validator: (value) => (value as string).length >= 5,
        errorMessage: 'Name should be at least 5 characters',
        severity: ValidationSeverity.WARNING,
        category: ValidationCategory.LENGTH,
      };

      const context = validationEngine.createContext('name', {});
      const result = validationEngine.validateField('John', rule, context);

      expect(result.warnings.length).toBe(0);
    });
  });
});
