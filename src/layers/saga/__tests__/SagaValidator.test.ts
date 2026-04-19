/**
 * Saga Validator Unit Tests
 * 
 * Tests for SagaValidator implementation.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { SagaValidator } from '../implementations/SagaValidator';
import { Logger } from '../implementations/Logger';
import { SagaStep } from '../types/saga-types';

describe('SagaValidator', () => {
  let validator: SagaValidator;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger();
    validator = new SagaValidator(logger);
  });

  describe('constructor', () => {
    it('should initialize with logger', () => {
      expect(validator).toBeDefined();
    });
  });

  describe('getValidatorName', () => {
    it('should return validator name', () => {
      expect(validator.getValidatorName()).toBe('DefaultSagaValidator');
    });
  });

  describe('validateStep', () => {
    it('should validate valid step', () => {
      const step: SagaStep<string> = {
        name: 'step1',
        execute: jest.fn().mockResolvedValue('result'),
        compensate: jest.fn().mockResolvedValue(undefined),
      };

      const result = validator.validateStep(step, 0);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('should fail validation for empty step name', () => {
      const step: SagaStep<string> = {
        name: '',
        execute: jest.fn().mockResolvedValue('result'),
        compensate: jest.fn().mockResolvedValue(undefined),
      };

      const result = validator.validateStep(step, 0);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Step name is required');
    });

    it('should fail validation for missing execute function', () => {
      const step: SagaStep<string> = {
        name: 'step1',
        execute: undefined as any,
        compensate: jest.fn().mockResolvedValue(undefined),
      };

      const result = validator.validateStep(step, 0);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('execute function');
    });

    it('should fail validation for missing compensate function', () => {
      const step: SagaStep<string> = {
        name: 'step1',
        execute: jest.fn().mockResolvedValue('result'),
        compensate: undefined as any,
      };

      const result = validator.validateStep(step, 0);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('compensate function');
    });

    it('should fail validation for multiple errors', () => {
      const step: SagaStep<string> = {
        name: '',
        execute: undefined as any,
        compensate: undefined as any,
      };

      const result = validator.validateStep(step, 0);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('validateSteps', () => {
    it('should validate all valid steps', () => {
      const steps: SagaStep<string>[] = [
        {
          name: 'step1',
          execute: jest.fn().mockResolvedValue('result1'),
          compensate: jest.fn().mockResolvedValue(undefined),
        },
        {
          name: 'step2',
          execute: jest.fn().mockResolvedValue('result2'),
          compensate: jest.fn().mockResolvedValue(undefined),
        },
      ];

      const result = validator.validateSteps(steps);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('should fail validation for duplicate names', () => {
      const steps: SagaStep<string>[] = [
        {
          name: 'duplicate',
          execute: jest.fn().mockResolvedValue('result1'),
          compensate: jest.fn().mockResolvedValue(undefined),
        },
        {
          name: 'duplicate',
          execute: jest.fn().mockResolvedValue('result2'),
          compensate: jest.fn().mockResolvedValue(undefined),
        },
      ];

      const result = validator.validateSteps(steps);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.message.includes('Duplicate'))).toBe(true);
    });

    it('should fail validation for invalid step', () => {
      const steps: SagaStep<string>[] = [
        {
          name: 'step1',
          execute: jest.fn().mockResolvedValue('result1'),
          compensate: jest.fn().mockResolvedValue(undefined),
        },
        {
          name: '',
          execute: jest.fn().mockResolvedValue('result2'),
          compensate: jest.fn().mockResolvedValue(undefined),
        },
      ];

      const result = validator.validateSteps(steps);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle empty steps array', () => {
      const result = validator.validateSteps([]);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('validateNameUniqueness', () => {
    it('should pass validation for unique names', () => {
      const steps: SagaStep<string>[] = [
        {
          name: 'step1',
          execute: jest.fn().mockResolvedValue('result1'),
          compensate: jest.fn().mockResolvedValue(undefined),
        },
        {
          name: 'step2',
          execute: jest.fn().mockResolvedValue('result2'),
          compensate: jest.fn().mockResolvedValue(undefined),
        },
      ];

      const result = validator.validateNameUniqueness(steps);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail validation for duplicate names', () => {
      const steps: SagaStep<string>[] = [
        {
          name: 'duplicate',
          execute: jest.fn().mockResolvedValue('result1'),
          compensate: jest.fn().mockResolvedValue(undefined),
        },
        {
          name: 'duplicate',
          execute: jest.fn().mockResolvedValue('result2'),
          compensate: jest.fn().mockResolvedValue(undefined),
        },
      ];

      const result = validator.validateNameUniqueness(steps);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].message).toContain('Duplicate');
      expect(result.errors[1].message).toContain('Duplicate');
    });

    it('should fail validation for multiple duplicates', () => {
      const steps: SagaStep<string>[] = [
        {
          name: 'duplicate',
          execute: jest.fn().mockResolvedValue('result1'),
          compensate: jest.fn().mockResolvedValue(undefined),
        },
        {
          name: 'duplicate',
          execute: jest.fn().mockResolvedValue('result2'),
          compensate: jest.fn().mockResolvedValue(undefined),
        },
        {
          name: 'duplicate',
          execute: jest.fn().mockResolvedValue('result3'),
          compensate: jest.fn().mockResolvedValue(undefined),
        },
      ];

      const result = validator.validateNameUniqueness(steps);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(3);
    });

    it('should handle empty steps array', () => {
      const result = validator.validateNameUniqueness([]);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('validateStepFunctions', () => {
    it('should pass validation for valid functions', () => {
      const step: SagaStep<string> = {
        name: 'step1',
        execute: jest.fn().mockResolvedValue('result'),
        compensate: jest.fn().mockResolvedValue(undefined),
      };

      const result = validator.validateStepFunctions(step);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail validation for missing execute', () => {
      const step: SagaStep<string> = {
        name: 'step1',
        execute: undefined as any,
        compensate: jest.fn().mockResolvedValue(undefined),
      };

      const result = validator.validateStepFunctions(step);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('execute');
    });

    it('should fail validation for missing compensate', () => {
      const step: SagaStep<string> = {
        name: 'step1',
        execute: jest.fn().mockResolvedValue('result'),
        compensate: undefined as any,
      };

      const result = validator.validateStepFunctions(step);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('compensate');
    });

    it('should fail validation for both missing functions', () => {
      const step: SagaStep<string> = {
        name: 'step1',
        execute: undefined as any,
        compensate: undefined as any,
      };

      const result = validator.validateStepFunctions(step);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });
  });

  describe('edge cases', () => {
    it('should handle step with whitespace name', () => {
      const step: SagaStep<string> = {
        name: '   ',
        execute: jest.fn().mockResolvedValue('result'),
        compensate: jest.fn().mockResolvedValue(undefined),
      };

      const result = validator.validateStep(step, 0);

      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('Step name is required');
    });

    it('should handle step with null name', () => {
      const step: SagaStep<string> = {
        name: null as any,
        execute: jest.fn().mockResolvedValue('result'),
        compensate: jest.fn().mockResolvedValue(undefined),
      };

      const result = validator.validateStep(step, 0);

      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('Step name is required');
    });

    it('should handle step with undefined name', () => {
      const step: SagaStep<string> = {
        name: undefined as any,
        execute: jest.fn().mockResolvedValue('result'),
        compensate: jest.fn().mockResolvedValue(undefined),
      };

      const result = validator.validateStep(step, 0);

      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('Step name is required');
    });

    it('should handle step with non-function execute', () => {
      const step: SagaStep<string> = {
        name: 'step1',
        execute: 'not a function' as any,
        compensate: jest.fn().mockResolvedValue(undefined),
      };

      const result = validator.validateStep(step, 0);

      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('execute function');
    });

    it('should handle step with non-function compensate', () => {
      const step: SagaStep<string> = {
        name: 'step1',
        execute: jest.fn().mockResolvedValue('result'),
        compensate: 'not a function' as any,
      };

      const result = validator.validateStep(step, 0);

      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('compensate function');
    });
  });
});
