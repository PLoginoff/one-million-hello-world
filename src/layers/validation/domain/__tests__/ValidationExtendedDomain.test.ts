/**
 * Extended domain tests for Validation
 */

import { ValidationExecution } from '../entities/ValidationExecution';
import { ValidationConfigState as ValidationConfigEntity } from '../entities/ValidationConfigState';
import { ValidationMetrics } from '../entities/ValidationMetrics';
import { ValidationThreshold } from '../value-objects/ValidationThreshold';
import { ValidationTimeWindow } from '../value-objects/ValidationTimeWindow';
import { ValidationPriority } from '../value-objects/ValidationPriority';
import { ValidationExecuted } from '../events/ValidationExecuted';
import { ValidationFailed } from '../events/ValidationFailed';

describe('Extended Domain: Validation', () => {
  describe('ValidationExecution', () => {
    it('should create with pending status', () => {
      var exec = ValidationExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = ValidationExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = ValidationExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = ValidationExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = ValidationExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = ValidationExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('ValidationThreshold', () => {
    it('should create within bounds', () => {
      var t = ValidationThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => ValidationThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = ValidationThreshold.create(10);
      var high = ValidationThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('ValidationTimeWindow', () => {
    it('should create from minutes', () => {
      var w = ValidationTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = ValidationTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = ValidationTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => ValidationTimeWindow.create(100, 0)).toThrow();
      expect(() => ValidationTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('ValidationPriority', () => {
    it('should create with valid value', () => {
      var p1 = ValidationPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => ValidationPriority.create(15)).toThrow();
      expect(() => ValidationPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(ValidationPriority.low().isLow()).toBe(true);
      expect(ValidationPriority.medium().isMedium()).toBe(true);
      expect(ValidationPriority.high().isHigh()).toBe(true);
      expect(ValidationPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('ValidationExecuted Event', () => {
    it('should create event', () => {
      var ev = ValidationExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = ValidationExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('ValidationFailed Event', () => {
    it('should create failed event', () => {
      var ev = ValidationFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
