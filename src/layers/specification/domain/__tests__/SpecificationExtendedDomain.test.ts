/**
 * Extended domain tests for Specification
 */

import { SpecificationExecution } from '../entities/SpecificationExecution';
import { SpecificationConfigState as SpecificationConfigEntity } from '../entities/SpecificationConfigState';
import { SpecificationMetricsSnapshot } from '../entities/SpecificationMetricsSnapshot';
import { SpecificationThreshold } from '../value-objects/SpecificationThreshold';
import { SpecificationTimeWindow } from '../value-objects/SpecificationTimeWindow';
import { SpecificationPriority } from '../value-objects/SpecificationPriority';
import { SpecificationExecuted } from '../events/SpecificationExecuted';
import { SpecificationFailed } from '../events/SpecificationFailed';

describe('Extended Domain: Specification', () => {
  describe('SpecificationExecution', () => {
    it('should create with pending status', () => {
      var exec = SpecificationExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = SpecificationExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = SpecificationExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = SpecificationExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = SpecificationExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = SpecificationExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('SpecificationThreshold', () => {
    it('should create within bounds', () => {
      var t = SpecificationThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => SpecificationThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = SpecificationThreshold.create(10);
      var high = SpecificationThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('SpecificationTimeWindow', () => {
    it('should create from minutes', () => {
      var w = SpecificationTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = SpecificationTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = SpecificationTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => SpecificationTimeWindow.create(100, 0)).toThrow();
      expect(() => SpecificationTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('SpecificationPriority', () => {
    it('should create with valid value', () => {
      var p1 = SpecificationPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => SpecificationPriority.create(15)).toThrow();
      expect(() => SpecificationPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(SpecificationPriority.low().isLow()).toBe(true);
      expect(SpecificationPriority.medium().isMedium()).toBe(true);
      expect(SpecificationPriority.high().isHigh()).toBe(true);
      expect(SpecificationPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('SpecificationExecuted Event', () => {
    it('should create event', () => {
      var ev = SpecificationExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = SpecificationExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('SpecificationFailed Event', () => {
    it('should create failed event', () => {
      var ev = SpecificationFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
