/**
 * Composite Validator Tests
 */

import { CompositeValidator } from '../../validation/CompositeValidator';
import { IValidator } from '../../validation/IValidator';

class MockValidator implements IValidator {
  constructor(private _valid: boolean = true, private _name: string = 'mock') {}

  validate() {
    return {
      valid: this._valid,
      errors: this._valid ? [] : ['error'],
      warnings: [],
    };
  }

  getValidatorName() {
    return this._name;
  }
}

describe('CompositeValidator', () => {
  describe('All Mode', () => {
    it('should pass when all validators pass', () => {
      const validator = new CompositeValidator('all', 'all');
      validator.addValidator(new MockValidator(true));
      validator.addValidator(new MockValidator(true));
      const result = validator.validate({});
      expect(result.valid).toBe(true);
    });

    it('should fail when any validator fails', () => {
      const validator = new CompositeValidator('all', 'all');
      validator.addValidator(new MockValidator(true));
      validator.addValidator(new MockValidator(false));
      const result = validator.validate({});
      expect(result.valid).toBe(false);
    });
  });

  describe('Any Mode', () => {
    it('should pass when any validator passes', () => {
      const validator = new CompositeValidator('any', 'any');
      validator.addValidator(new MockValidator(false));
      validator.addValidator(new MockValidator(true));
      const result = validator.validate({});
      expect(result.valid).toBe(true);
    });

    it('should fail when all validators fail', () => {
      const validator = new CompositeValidator('any', 'any');
      validator.addValidator(new MockValidator(false));
      validator.addValidator(new MockValidator(false));
      const result = validator.validate({});
      expect(result.valid).toBe(false);
    });
  });

  describe('First Mode', () => {
    it('should pass when first validator passes', () => {
      const validator = new CompositeValidator('first', 'first');
      validator.addValidator(new MockValidator(true));
      validator.addValidator(new MockValidator(false));
      const result = validator.validate({});
      expect(result.valid).toBe(true);
    });

    it('should fail when first validator fails', () => {
      const validator = new CompositeValidator('first', 'first');
      validator.addValidator(new MockValidator(false));
      validator.addValidator(new MockValidator(true));
      const result = validator.validate({});
      expect(result.valid).toBe(false);
    });
  });

  describe('Validator Management', () => {
    it('should add validator', () => {
      const validator = new CompositeValidator('all', 'test');
      const mock = new MockValidator();
      validator.addValidator(mock);
      expect(validator.getValidators()).toContain(mock);
    });

    it('should remove validator', () => {
      const validator = new CompositeValidator('all', 'test');
      const mock = new MockValidator();
      validator.addValidator(mock);
      validator.removeValidator(mock);
      expect(validator.getValidators()).not.toContain(mock);
    });

    it('should clear all validators', () => {
      const validator = new CompositeValidator('all', 'test');
      validator.addValidator(new MockValidator());
      validator.addValidator(new MockValidator());
      validator.clearValidators();
      expect(validator.getValidators()).toHaveLength(0);
    });
  });
});
