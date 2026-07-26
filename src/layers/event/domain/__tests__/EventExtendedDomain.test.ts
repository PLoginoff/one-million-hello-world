/**
 * Extended domain tests for Event
 */

import { EventExecution } from '../entities/EventExecution';
import { EventConfigState as EventConfigEntity } from '../entities/EventConfigState';
import { EventMetricsSnapshot } from '../entities/EventMetricsSnapshot';
import { EventThreshold } from '../value-objects/EventThreshold';
import { EventTimeWindow } from '../value-objects/EventTimeWindow';
import { EventPriority } from '../value-objects/EventPriority';
import { EventExecuted } from '../events/EventExecuted';
import { EventFailed } from '../events/EventFailed';

describe('Extended Domain: Event', () => {
  describe('EventExecution', () => {
    it('should create with pending status', () => {
      var exec = EventExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = EventExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = EventExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = EventExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = EventExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = EventExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('EventThreshold', () => {
    it('should create within bounds', () => {
      var t = EventThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => EventThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = EventThreshold.create(10);
      var high = EventThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('EventTimeWindow', () => {
    it('should create from minutes', () => {
      var w = EventTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = EventTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = EventTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => EventTimeWindow.create(100, 0)).toThrow();
      expect(() => EventTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('EventPriority', () => {
    it('should create with valid value', () => {
      var p1 = EventPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => EventPriority.create(15)).toThrow();
      expect(() => EventPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(EventPriority.low().isLow()).toBe(true);
      expect(EventPriority.medium().isMedium()).toBe(true);
      expect(EventPriority.high().isHigh()).toBe(true);
      expect(EventPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('EventExecuted Event', () => {
    it('should create event', () => {
      var ev = EventExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = EventExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('EventFailed Event', () => {
    it('should create failed event', () => {
      var ev = EventFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
