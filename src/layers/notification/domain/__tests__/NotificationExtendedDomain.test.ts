/**
 * Extended domain tests for Notification
 */

import { NotificationExecution } from '../entities/NotificationExecution';
import { NotificationConfigState as NotificationConfigEntity } from '../entities/NotificationConfigState';
import { NotificationMetricsSnapshot } from '../entities/NotificationMetricsSnapshot';
import { NotificationThreshold } from '../value-objects/NotificationThreshold';
import { NotificationTimeWindow } from '../value-objects/NotificationTimeWindow';
import { NotificationPriority } from '../value-objects/NotificationPriority';
import { NotificationExecuted } from '../events/NotificationExecuted';
import { NotificationFailed } from '../events/NotificationFailed';

describe('Extended Domain: Notification', () => {
  describe('NotificationExecution', () => {
    it('should create with pending status', () => {
      var exec = NotificationExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = NotificationExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = NotificationExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = NotificationExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = NotificationExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = NotificationExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('NotificationThreshold', () => {
    it('should create within bounds', () => {
      var t = NotificationThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => NotificationThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = NotificationThreshold.create(10);
      var high = NotificationThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('NotificationTimeWindow', () => {
    it('should create from minutes', () => {
      var w = NotificationTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = NotificationTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = NotificationTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => NotificationTimeWindow.create(100, 0)).toThrow();
      expect(() => NotificationTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('NotificationPriority', () => {
    it('should create with valid value', () => {
      var p1 = NotificationPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => NotificationPriority.create(15)).toThrow();
      expect(() => NotificationPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(NotificationPriority.low().isLow()).toBe(true);
      expect(NotificationPriority.medium().isMedium()).toBe(true);
      expect(NotificationPriority.high().isHigh()).toBe(true);
      expect(NotificationPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('NotificationExecuted Event', () => {
    it('should create event', () => {
      var ev = NotificationExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = NotificationExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('NotificationFailed Event', () => {
    it('should create failed event', () => {
      var ev = NotificationFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
