/**
 * Extended domain tests for EventSourcing
 */

import { EventSourcingExecution } from '../entities/EventSourcingExecution';
import { EventSourcingConfigState as EventSourcingConfigEntity } from '../entities/EventSourcingConfigState';
import { EventSourcingMetricsSnapshot } from '../entities/EventSourcingMetricsSnapshot';
import { EventSourcingThreshold } from '../value-objects/EventSourcingThreshold';
import { EventSourcingTimeWindow } from '../value-objects/EventSourcingTimeWindow';
import { EventSourcingPriority } from '../value-objects/EventSourcingPriority';
import { EventSourcingExecuted } from '../events/EventSourcingExecuted';
import { EventSourcingFailed } from '../events/EventSourcingFailed';

describe('Extended Domain: EventSourcing', () => {
  describe('EventSourcingExecution', () => {
    it('should create with pending status', () => {
      var exec = EventSourcingExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = EventSourcingExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = EventSourcingExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = EventSourcingExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = EventSourcingExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = EventSourcingExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('EventSourcingThreshold', () => {
    it('should create within bounds', () => {
      var t = EventSourcingThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => EventSourcingThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = EventSourcingThreshold.create(10);
      var high = EventSourcingThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('EventSourcingTimeWindow', () => {
    it('should create from minutes', () => {
      var w = EventSourcingTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = EventSourcingTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = EventSourcingTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => EventSourcingTimeWindow.create(100, 0)).toThrow();
      expect(() => EventSourcingTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('EventSourcingPriority', () => {
    it('should create with valid value', () => {
      var p1 = EventSourcingPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => EventSourcingPriority.create(15)).toThrow();
      expect(() => EventSourcingPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(EventSourcingPriority.low().isLow()).toBe(true);
      expect(EventSourcingPriority.medium().isMedium()).toBe(true);
      expect(EventSourcingPriority.high().isHigh()).toBe(true);
      expect(EventSourcingPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('EventSourcingExecuted Event', () => {
    it('should create event', () => {
      var ev = EventSourcingExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = EventSourcingExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('EventSourcingFailed Event', () => {
    it('should create failed event', () => {
      var ev = EventSourcingFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
