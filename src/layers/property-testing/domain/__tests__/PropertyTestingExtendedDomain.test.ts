/**
 * Extended domain tests for PropertyTesting
 */

import { PropertyTestingExecution } from '../entities/PropertyTestingExecution';
import { PropertyTestingConfigState as PropertyTestingConfigEntity } from '../entities/PropertyTestingConfigState';
import { PropertyTestingMetricsSnapshot } from '../entities/PropertyTestingMetricsSnapshot';
import { PropertyTestingThreshold } from '../value-objects/PropertyTestingThreshold';
import { PropertyTestingTimeWindow } from '../value-objects/PropertyTestingTimeWindow';
import { PropertyTestingPriority } from '../value-objects/PropertyTestingPriority';
import { PropertyTestingExecuted } from '../events/PropertyTestingExecuted';
import { PropertyTestingFailed } from '../events/PropertyTestingFailed';

describe('Extended Domain: PropertyTesting', () => {
  describe('PropertyTestingExecution', () => {
    it('should create with pending status', () => {
      var exec = PropertyTestingExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = PropertyTestingExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = PropertyTestingExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = PropertyTestingExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = PropertyTestingExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = PropertyTestingExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('PropertyTestingThreshold', () => {
    it('should create within bounds', () => {
      var t = PropertyTestingThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => PropertyTestingThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = PropertyTestingThreshold.create(10);
      var high = PropertyTestingThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('PropertyTestingTimeWindow', () => {
    it('should create from minutes', () => {
      var w = PropertyTestingTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = PropertyTestingTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = PropertyTestingTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => PropertyTestingTimeWindow.create(100, 0)).toThrow();
      expect(() => PropertyTestingTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('PropertyTestingPriority', () => {
    it('should create with valid value', () => {
      var p1 = PropertyTestingPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => PropertyTestingPriority.create(15)).toThrow();
      expect(() => PropertyTestingPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(PropertyTestingPriority.low().isLow()).toBe(true);
      expect(PropertyTestingPriority.medium().isMedium()).toBe(true);
      expect(PropertyTestingPriority.high().isHigh()).toBe(true);
      expect(PropertyTestingPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('PropertyTestingExecuted Event', () => {
    it('should create event', () => {
      var ev = PropertyTestingExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = PropertyTestingExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('PropertyTestingFailed Event', () => {
    it('should create failed event', () => {
      var ev = PropertyTestingFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
