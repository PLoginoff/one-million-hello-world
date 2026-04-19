/**
 * EventValidator Unit Tests
 * 
 * Comprehensive tests for EventValidator utility.
 * Tests cover validation rules, custom rules, batch validation, and edge cases.
 */

import { EventValidator, ValidationResult, ValidationRule } from '../../utils/EventValidator';
import { Event } from '../../domain/entities/Event';

describe('EventValidator', () => {
  let validator: EventValidator;

  beforeEach(() => {
    validator = new EventValidator();
  });

  describe('constructor', () => {
    it('should create validator with default rules', () => {
      expect(validator).toBeDefined();
    });
  });

  describe('validate', () => {
    it('should validate valid event', () => {
      const event = Event.create('test.event', { data: 'test' });
      const result = validator.validate(event);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should detect missing ID', () => {
      const event = Event.create('test.event', {});
      (event as any).id = undefined;

      const result = validator.validate(event);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining('id'),
        })
      );
    });

    it('should detect missing type', () => {
      const event = Event.create('test.event', {});
      (event as any).type = undefined;

      const result = validator.validate(event);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect missing payload', () => {
      const event = Event.create('test.event', {});
      (event as any).payload = undefined;

      const result = validator.validate(event);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect missing metadata', () => {
      const event = Event.create('test.event', {});
      (event as any).metadata = undefined;

      const result = validator.validate(event);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect missing correlation ID', () => {
      const event = Event.create('test.event', {});
      (event as any).metadata.correlationId = undefined;

      const result = validator.validate(event);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect invalid timestamp (future)', () => {
      const event = Event.create('test.event', {});
      (event as any).occurredAt = new Date(Date.now() + 100000);

      const result = validator.validate(event);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return warnings array', () => {
      const event = Event.create('test.event', {});
      const result = validator.validate(event);

      expect(result.warnings).toBeDefined();
      expect(Array.isArray(result.warnings)).toBe(true);
    });
  });

  describe('validateBatch', () => {
    it('should validate multiple events', () => {
      const events = [
        Event.create('event1', {}),
        Event.create('event2', {}),
        Event.create('event3', {}),
      ];

      const result = validator.validateBatch(events);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should aggregate errors from all events', () => {
      const event1 = Event.create('event1', {});
      const event2 = Event.create('event2', {});
      (event1 as any).id = undefined;
      (event2 as any).type = undefined;

      const result = validator.validateBatch([event1, event2]);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle empty batch', () => {
      const result = validator.validateBatch([]);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should aggregate warnings from all events', () => {
      const events = [
        Event.create('event1', {}),
        Event.create('event2', {}),
      ];

      const result = validator.validateBatch(events);

      expect(result.warnings).toBeDefined();
      expect(Array.isArray(result.warnings)).toBe(true);
    });
  });

  describe('addRule', () => {
    it('should add custom validation rule', () => {
      const customRule: ValidationRule = {
        name: 'custom-rule',
        validate: (event) => true,
        defaultMessage: 'Custom validation failed',
      };

      validator.addRule(customRule);

      const event = Event.create('test.event', {});
      const result = validator.validate(event);

      expect(result.valid).toBe(true);
    });

    it('should apply custom rule that fails', () => {
      const customRule: ValidationRule = {
        name: 'custom-rule',
        validate: (event) => false,
        defaultMessage: 'Custom validation failed',
      };

      validator.addRule(customRule);

      const event = Event.create('test.event', {});
      const result = validator.validate(event);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: 'Custom validation failed',
        })
      );
    });

    it('should add multiple custom rules', () => {
      const rule1: ValidationRule = {
        name: 'rule1',
        validate: () => true,
        defaultMessage: 'Rule 1 failed',
      };

      const rule2: ValidationRule = {
        name: 'rule2',
        validate: () => true,
        defaultMessage: 'Rule 2 failed',
      };

      validator.addRule(rule1);
      validator.addRule(rule2);

      const event = Event.create('test.event', {});
      const result = validator.validate(event);

      expect(result.valid).toBe(true);
    });
  });

  describe('removeRule', () => {
    it('should remove custom rule by name', () => {
      const customRule: ValidationRule = {
        name: 'custom-rule',
        validate: () => false,
        defaultMessage: 'Custom validation failed',
      };

      validator.addRule(customRule);

      const removed = validator.removeRule('custom-rule');

      expect(removed).toBe(true);

      const event = Event.create('test.event', {});
      const result = validator.validate(event);

      expect(result.valid).toBe(true);
    });

    it('should return false when removing non-existent rule', () => {
      const removed = validator.removeRule('non-existent-rule');
      expect(removed).toBe(false);
    });

    it('should remove default rule', () => {
      const removed = validator.removeRule('id-required');
      expect(removed).toBe(true);

      const event = Event.create('test.event', {});
      (event as any).id = undefined;

      const result = validator.validate(event);

      expect(result.valid).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle event with complex payload', () => {
      const complexPayload = {
        nested: { deep: { value: 42 } },
        array: [1, 2, 3],
      };
      const event = Event.create('test.event', complexPayload);

      const result = validator.validate(event);

      expect(result.valid).toBe(true);
    });

    it('should handle event with null payload', () => {
      const event = Event.create('test.event', null);

      const result = validator.validate(event);

      expect(result.valid).toBe(true);
    });

    it('should handle event with array payload', () => {
      const event = Event.create('test.event', [1, 2, 3]);

      const result = validator.validate(event);

      expect(result.valid).toBe(true);
    });

    it('should handle event with string payload', () => {
      const event = Event.create('test.event', 'test-string');

      const result = validator.validate(event);

      expect(result.valid).toBe(true);
    });

    it('should handle event with number payload', () => {
      const event = Event.create('test.event', 42);

      const result = validator.validate(event);

      expect(result.valid).toBe(true);
    });

    it('should handle event with boolean payload', () => {
      const event = Event.create('test.event', true);

      const result = validator.validate(event);

      expect(result.valid).toBe(true);
    });

    it('should validate many events in batch', () => {
      const events = Array.from({ length: 1000 }, (_, i) =>
        Event.create(`event${i}`, {})
      );

      const result = validator.validateBatch(events);

      expect(result.valid).toBe(true);
    });

    it('should handle custom rule with event data access', () => {
      const customRule: ValidationRule = {
        name: 'payload-check',
        validate: (event) => {
          return (event.payload.data as any).userId !== undefined;
        },
        defaultMessage: 'Missing userId in payload',
      };

      validator.addRule(customRule);

      const eventWithout = Event.create('test.event', { name: 'test' });
      const resultWithout = validator.validate(eventWithout);

      expect(resultWithout.valid).toBe(false);

      const eventWith = Event.create('test.event', { userId: '123' });
      const resultWith = validator.validate(eventWith);

      expect(resultWith.valid).toBe(true);
    });

    it('should handle rule that throws error', () => {
      const errorRule: ValidationRule = {
        name: 'error-rule',
        validate: () => {
          throw new Error('Rule error');
        },
        defaultMessage: 'Rule failed',
      };

      validator.addRule(errorRule);

      const event = Event.create('test.event', {});

      expect(() => validator.validate(event)).toThrow('Rule error');
    });
  });
});
