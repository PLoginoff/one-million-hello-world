/**
 * Extended domain tests for Throttling
 */

import { ThrottlingExecution } from '../entities/ThrottlingExecution';
import { ThrottlingConfigState as ThrottlingConfigEntity } from '../entities/ThrottlingConfigState';
import { ThrottlingMetricsSnapshot } from '../entities/ThrottlingMetricsSnapshot';
import { ThrottlingThreshold } from '../value-objects/ThrottlingThreshold';
import { ThrottlingTimeWindow } from '../value-objects/ThrottlingTimeWindow';
import { ThrottlingPriority } from '../value-objects/ThrottlingPriority';
import { ThrottlingExecuted } from '../events/ThrottlingExecuted';
import { ThrottlingFailed } from '../events/ThrottlingFailed';

describe('Extended Domain: Throttling', () => {
  describe('ThrottlingExecution', () => {
    it('should create with pending status', () => {
      var exec = ThrottlingExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = ThrottlingExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = ThrottlingExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = ThrottlingExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = ThrottlingExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = ThrottlingExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('ThrottlingThreshold', () => {
    it('should create within bounds', () => {
      var t = ThrottlingThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => ThrottlingThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = ThrottlingThreshold.create(10);
      var high = ThrottlingThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('ThrottlingTimeWindow', () => {
    it('should create from minutes', () => {
      var w = ThrottlingTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = ThrottlingTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = ThrottlingTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => ThrottlingTimeWindow.create(100, 0)).toThrow();
      expect(() => ThrottlingTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('ThrottlingPriority', () => {
    it('should create with valid value', () => {
      var p1 = ThrottlingPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => ThrottlingPriority.create(15)).toThrow();
      expect(() => ThrottlingPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(ThrottlingPriority.low().isLow()).toBe(true);
      expect(ThrottlingPriority.medium().isMedium()).toBe(true);
      expect(ThrottlingPriority.high().isHigh()).toBe(true);
      expect(ThrottlingPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('ThrottlingExecuted Event', () => {
    it('should create event', () => {
      var ev = ThrottlingExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = ThrottlingExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('ThrottlingFailed Event', () => {
    it('should create failed event', () => {
      var ev = ThrottlingFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
