/**
 * Extended domain tests for Controller
 */

import { ControllerExecution } from '../entities/ControllerExecution';
import { ControllerConfigState as ControllerConfigEntity } from '../entities/ControllerConfigState';
import { ControllerMetrics } from '../entities/ControllerMetrics';
import { ControllerThreshold } from '../value-objects/ControllerThreshold';
import { ControllerTimeWindow } from '../value-objects/ControllerTimeWindow';
import { ControllerPriority } from '../value-objects/ControllerPriority';
import { ControllerExecuted } from '../events/ControllerExecuted';
import { ControllerFailed } from '../events/ControllerFailed';

describe('Extended Domain: Controller', () => {
  describe('ControllerExecution', () => {
    it('should create with pending status', () => {
      var exec = ControllerExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = ControllerExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = ControllerExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = ControllerExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = ControllerExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = ControllerExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('ControllerThreshold', () => {
    it('should create within bounds', () => {
      var t = ControllerThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => ControllerThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = ControllerThreshold.create(10);
      var high = ControllerThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('ControllerTimeWindow', () => {
    it('should create from minutes', () => {
      var w = ControllerTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = ControllerTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = ControllerTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => ControllerTimeWindow.create(100, 0)).toThrow();
      expect(() => ControllerTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('ControllerPriority', () => {
    it('should create with valid value', () => {
      var p1 = ControllerPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => ControllerPriority.create(15)).toThrow();
      expect(() => ControllerPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(ControllerPriority.low().isLow()).toBe(true);
      expect(ControllerPriority.medium().isMedium()).toBe(true);
      expect(ControllerPriority.high().isHigh()).toBe(true);
      expect(ControllerPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('ControllerExecuted Event', () => {
    it('should create event', () => {
      var ev = ControllerExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = ControllerExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('ControllerFailed Event', () => {
    it('should create failed event', () => {
      var ev = ControllerFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
