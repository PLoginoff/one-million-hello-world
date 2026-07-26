/**
 * Extended domain tests for RateLimiting
 */

import { RateLimitingExecution } from '../entities/RateLimitingExecution';
import { RateLimitingConfigState as RateLimitingConfigEntity } from '../entities/RateLimitingConfigState';
import { RateLimitingMetrics } from '../entities/RateLimitingMetrics';
import { RateLimitingThreshold } from '../value-objects/RateLimitingThreshold';
import { RateLimitingTimeWindow } from '../value-objects/RateLimitingTimeWindow';
import { RateLimitingPriority } from '../value-objects/RateLimitingPriority';
import { RateLimitingExecuted } from '../events/RateLimitingExecuted';
import { RateLimitingFailed } from '../events/RateLimitingFailed';

describe('Extended Domain: RateLimiting', () => {
  describe('RateLimitingExecution', () => {
    it('should create with pending status', () => {
      var exec = RateLimitingExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = RateLimitingExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = RateLimitingExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = RateLimitingExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = RateLimitingExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = RateLimitingExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('RateLimitingThreshold', () => {
    it('should create within bounds', () => {
      var t = RateLimitingThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => RateLimitingThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = RateLimitingThreshold.create(10);
      var high = RateLimitingThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('RateLimitingTimeWindow', () => {
    it('should create from minutes', () => {
      var w = RateLimitingTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = RateLimitingTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = RateLimitingTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => RateLimitingTimeWindow.create(100, 0)).toThrow();
      expect(() => RateLimitingTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('RateLimitingPriority', () => {
    it('should create with valid value', () => {
      var p1 = RateLimitingPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => RateLimitingPriority.create(15)).toThrow();
      expect(() => RateLimitingPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(RateLimitingPriority.low().isLow()).toBe(true);
      expect(RateLimitingPriority.medium().isMedium()).toBe(true);
      expect(RateLimitingPriority.high().isHigh()).toBe(true);
      expect(RateLimitingPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('RateLimitingExecuted Event', () => {
    it('should create event', () => {
      var ev = RateLimitingExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = RateLimitingExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('RateLimitingFailed Event', () => {
    it('should create failed event', () => {
      var ev = RateLimitingFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
