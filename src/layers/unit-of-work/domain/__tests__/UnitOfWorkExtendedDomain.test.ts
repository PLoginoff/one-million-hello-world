/**
 * Extended domain tests for UnitOfWork
 */

import { UnitOfWorkExecution } from '../entities/UnitOfWorkExecution';
import { UnitOfWorkConfigState as UnitOfWorkConfigEntity } from '../entities/UnitOfWorkConfigState';
import { UnitOfWorkMetricsSnapshot } from '../entities/UnitOfWorkMetricsSnapshot';
import { UnitOfWorkThreshold } from '../value-objects/UnitOfWorkThreshold';
import { UnitOfWorkTimeWindow } from '../value-objects/UnitOfWorkTimeWindow';
import { UnitOfWorkPriority } from '../value-objects/UnitOfWorkPriority';
import { UnitOfWorkExecuted } from '../events/UnitOfWorkExecuted';
import { UnitOfWorkFailed } from '../events/UnitOfWorkFailed';

describe('Extended Domain: UnitOfWork', () => {
  describe('UnitOfWorkExecution', () => {
    it('should create with pending status', () => {
      var exec = UnitOfWorkExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = UnitOfWorkExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = UnitOfWorkExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = UnitOfWorkExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = UnitOfWorkExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = UnitOfWorkExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('UnitOfWorkThreshold', () => {
    it('should create within bounds', () => {
      var t = UnitOfWorkThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => UnitOfWorkThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = UnitOfWorkThreshold.create(10);
      var high = UnitOfWorkThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('UnitOfWorkTimeWindow', () => {
    it('should create from minutes', () => {
      var w = UnitOfWorkTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = UnitOfWorkTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = UnitOfWorkTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => UnitOfWorkTimeWindow.create(100, 0)).toThrow();
      expect(() => UnitOfWorkTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('UnitOfWorkPriority', () => {
    it('should create with valid value', () => {
      var p1 = UnitOfWorkPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => UnitOfWorkPriority.create(15)).toThrow();
      expect(() => UnitOfWorkPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(UnitOfWorkPriority.low().isLow()).toBe(true);
      expect(UnitOfWorkPriority.medium().isMedium()).toBe(true);
      expect(UnitOfWorkPriority.high().isHigh()).toBe(true);
      expect(UnitOfWorkPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('UnitOfWorkExecuted Event', () => {
    it('should create event', () => {
      var ev = UnitOfWorkExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = UnitOfWorkExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('UnitOfWorkFailed Event', () => {
    it('should create failed event', () => {
      var ev = UnitOfWorkFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
