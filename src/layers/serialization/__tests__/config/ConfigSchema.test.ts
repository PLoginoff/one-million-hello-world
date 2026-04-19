/**
 * Config Schema Tests
 */

import { ConfigSchema, SchemaProperty } from '../../config/ConfigSchema';

describe('ConfigSchema', () => {
  describe('Validation', () => {
    it('should validate valid config', () => {
      const schema = new ConfigSchema({
        name: { type: 'string', required: true },
        age: { type: 'number', required: false },
      });
      const result = schema.validate({ name: 'John', age: 30 });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail on missing required property', () => {
      const schema = new ConfigSchema({
        name: { type: 'string', required: true },
      });
      const result = schema.validate({});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Required property \'name\' is missing');
    });

    it('should fail on type mismatch', () => {
      const schema = new ConfigSchema({
        age: { type: 'number', required: true },
      });
      const result = schema.validate({ age: '30' });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate enum values', () => {
      const schema = new ConfigSchema({
        status: { type: 'string', enum: ['active', 'inactive'] },
      });
      const result = schema.validate({ status: 'pending' });
      expect(result.valid).toBe(false);
    });

    it('should validate min/max for numbers', () => {
      const schema = new ConfigSchema({
        age: { type: 'number', min: 0, max: 150 },
      });
      const result = schema.validate({ age: 200 });
      expect(result.valid).toBe(false);
    });

    it('should validate min/max for strings', () => {
      const schema = new ConfigSchema({
        name: { type: 'string', min: 2, max: 10 },
      });
      const result = schema.validate({ name: 'A' });
      expect(result.valid).toBe(false);
    });

    it('should validate pattern', () => {
      const schema = new ConfigSchema({
        email: { type: 'string', pattern: '^[^@]+@[^@]+\\.[^@]+$' },
      });
      const result = schema.validate({ email: 'invalid' });
      expect(result.valid).toBe(false);
    });
  });

  describe('Defaults', () => {
    it('should get default values', () => {
      const schema = new ConfigSchema({
        name: { type: 'string', default: 'default' },
      });
      const defaults = schema.getDefaults();
      expect(defaults.name).toBe('default');
    });

    it('should apply defaults to config', () => {
      const schema = new ConfigSchema({
        name: { type: 'string', default: 'default' },
        age: { type: 'number', default: 0 },
      });
      const result = schema.applyDefaults({});
      expect(result.name).toBe('default');
      expect(result.age).toBe(0);
    });
  });
});
