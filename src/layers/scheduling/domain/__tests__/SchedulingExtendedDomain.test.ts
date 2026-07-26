/**
 * Extended domain tests for Scheduling
 */

import { SchedulingExecution } from '../entities/SchedulingExecution';
import { SchedulingConfigState as SchedulingConfigEntity } from '../entities/SchedulingConfigState';
import { SchedulingMetricsSnapshot } from '../entities/SchedulingMetricsSnapshot';
import { SchedulingThreshold } from '../value-objects/SchedulingThreshold';
import { SchedulingTimeWindow } from '../value-objects/SchedulingTimeWindow';
import { SchedulingPriority } from '../value-objects/SchedulingPriority';
import { SchedulingExecuted } from '../events/SchedulingExecuted';
import { SchedulingFailed } from '../events/SchedulingFailed';

describe('Extended Domain: Scheduling', () => {
  describe('SchedulingExecution', () => {
    it('should create with pending status', () => {
      var exec = SchedulingExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = SchedulingExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = SchedulingExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = SchedulingExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = SchedulingExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = SchedulingExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('SchedulingThreshold', () => {
    it('should create within bounds', () => {
      var t = SchedulingThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => SchedulingThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = SchedulingThreshold.create(10);
      var high = SchedulingThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('SchedulingTimeWindow', () => {
    it('should create from minutes', () => {
      var w = SchedulingTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = SchedulingTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = SchedulingTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => SchedulingTimeWindow.create(100, 0)).toThrow();
      expect(() => SchedulingTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('SchedulingPriority', () => {
    it('should create with valid value', () => {
      var p1 = SchedulingPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => SchedulingPriority.create(15)).toThrow();
      expect(() => SchedulingPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(SchedulingPriority.low().isLow()).toBe(true);
      expect(SchedulingPriority.medium().isMedium()).toBe(true);
      expect(SchedulingPriority.high().isHigh()).toBe(true);
      expect(SchedulingPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('SchedulingExecuted Event', () => {
    it('should create event', () => {
      var ev = SchedulingExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = SchedulingExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('SchedulingFailed Event', () => {
    it('should create failed event', () => {
      var ev = SchedulingFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
