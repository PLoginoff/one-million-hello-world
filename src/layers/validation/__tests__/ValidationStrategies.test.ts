/**
 * Validation Strategies Unit Tests
 */

import { CompositeValidationStrategy } from '../strategies/strategy/CompositeValidationStrategy';
import { ConditionalValidationStrategy } from '../strategies/strategy/ConditionalValidationStrategy';
import { IValidationStrategy } from '../strategies/strategy/IValidationStrategy';
import { ValidationResultEntity } from '../domain/entities/ValidationResultEntity';

function createPassStrategy(name: string): IValidationStrategy {
  return {
    getName: () => name,
    validate: () => ValidationResultEntity.success(),
  };
}

function createFailStrategy(name: string, field: string, message: string): IValidationStrategy {
  return {
    getName: () => name,
    validate: () => ValidationResultEntity.failure([{ field, message }]),
  };
}

describe('CompositeValidationStrategy', () => {
  it('should return name COMPOSITE_VALIDATION', () => {
    const strategy = new CompositeValidationStrategy();
    expect(strategy.getName()).toBe('COMPOSITE_VALIDATION');
  });

  it('should pass when all strategies pass', () => {
    const strategy = new CompositeValidationStrategy([createPassStrategy('s1'), createPassStrategy('s2')]);
    const result = strategy.validate({ test: true });
    expect(result.data.valid).toBe(true);
  });

  it('should fail when any strategy fails', () => {
    const strategy = new CompositeValidationStrategy([
      createPassStrategy('s1'),
      createFailStrategy('s2', 'name', 'name is required'),
    ]);
    const result = strategy.validate({});
    expect(result.data.valid).toBe(false);
    expect(result.data.errors.length).toBe(1);
    expect(result.data.errors[0].field).toBe('name');
  });

  it('should aggregate errors from multiple failing strategies', () => {
    const strategy = new CompositeValidationStrategy([
      createFailStrategy('s1', 'name', 'name is required'),
      createFailStrategy('s2', 'email', 'email is invalid'),
    ]);
    const result = strategy.validate({});
    expect(result.data.errors.length).toBe(2);
  });

  it('should support adding strategies immutably', () => {
    const original = new CompositeValidationStrategy([createPassStrategy('s1')]);
    const extended = original.addStrategy(createPassStrategy('s2'));
    expect(original.getStrategies().length).toBe(1);
    expect(extended.getStrategies().length).toBe(2);
  });

  it('should pass with empty strategy list', () => {
    const strategy = new CompositeValidationStrategy();
    const result = strategy.validate({});
    expect(result.data.valid).toBe(true);
  });
});

describe('ConditionalValidationStrategy', () => {
  it('should wrap inner strategy name', () => {
    const inner = createPassStrategy('INNER');
    const strategy = new ConditionalValidationStrategy(inner, () => true);
    expect(strategy.getName()).toBe('CONDITIONAL(INNER)');
  });

  it('should validate when condition is true', () => {
    const inner = createFailStrategy('INNER', 'field', 'error');
    const strategy = new ConditionalValidationStrategy(inner, () => true);
    const result = strategy.validate({});
    expect(result.data.valid).toBe(false);
  });

  it('should skip validation when condition is false', () => {
    const inner = createFailStrategy('INNER', 'field', 'error');
    const strategy = new ConditionalValidationStrategy(inner, () => false);
    const result = strategy.validate({});
    expect(result.data.valid).toBe(true);
  });

  it('should pass context to condition', () => {
    const inner = createPassStrategy('INNER');
    const strategy = new ConditionalValidationStrategy(inner, (_value, context) => context === 'test');
    expect(strategy.validate({}, 'test').data.valid).toBe(true);
    expect(strategy.validate({}, 'other').data.valid).toBe(true);
  });
});
