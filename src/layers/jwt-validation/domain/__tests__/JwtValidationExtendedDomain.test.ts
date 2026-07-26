/**
 * Extended domain tests for JwtValidation
 */

import { JwtValidationExecution } from '../entities/JwtValidationExecution';
import { JwtValidationConfigState as JwtValidationConfigEntity } from '../entities/JwtValidationConfigState';
import { JwtValidationMetricsSnapshot } from '../entities/JwtValidationMetricsSnapshot';
import { JwtValidationThreshold } from '../value-objects/JwtValidationThreshold';
import { JwtValidationTimeWindow } from '../value-objects/JwtValidationTimeWindow';
import { JwtValidationPriority } from '../value-objects/JwtValidationPriority';
import { JwtValidationExecuted } from '../events/JwtValidationExecuted';
import { JwtValidationFailed } from '../events/JwtValidationFailed';

describe('Extended Domain: JwtValidation', () => {
  describe('JwtValidationExecution', () => {
    it('should create with pending status', () => {
      var exec = JwtValidationExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = JwtValidationExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = JwtValidationExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = JwtValidationExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = JwtValidationExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = JwtValidationExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('JwtValidationThreshold', () => {
    it('should create within bounds', () => {
      var t = JwtValidationThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => JwtValidationThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = JwtValidationThreshold.create(10);
      var high = JwtValidationThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('JwtValidationTimeWindow', () => {
    it('should create from minutes', () => {
      var w = JwtValidationTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = JwtValidationTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = JwtValidationTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => JwtValidationTimeWindow.create(100, 0)).toThrow();
      expect(() => JwtValidationTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('JwtValidationPriority', () => {
    it('should create with valid value', () => {
      var p1 = JwtValidationPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => JwtValidationPriority.create(15)).toThrow();
      expect(() => JwtValidationPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(JwtValidationPriority.low().isLow()).toBe(true);
      expect(JwtValidationPriority.medium().isMedium()).toBe(true);
      expect(JwtValidationPriority.high().isHigh()).toBe(true);
      expect(JwtValidationPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('JwtValidationExecuted Event', () => {
    it('should create event', () => {
      var ev = JwtValidationExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = JwtValidationExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('JwtValidationFailed Event', () => {
    it('should create failed event', () => {
      var ev = JwtValidationFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
