/**
 * Extended domain tests for Retry
 */

import { RetryExecution } from '../entities/RetryExecution';
import { RetryConfigState as RetryConfigEntity } from '../entities/RetryConfigState';
import { RetryMetricsSnapshot } from '../entities/RetryMetricsSnapshot';
import { RetryThreshold } from '../value-objects/RetryThreshold';
import { RetryTimeWindow } from '../value-objects/RetryTimeWindow';
import { RetryPriority } from '../value-objects/RetryPriority';
import { RetryExecuted } from '../events/RetryExecuted';
import { RetryFailed } from '../events/RetryFailed';

describe('Extended Domain: Retry', () => {
  describe('RetryExecution', () => {
    it('should create with pending status', () => {
      var exec = RetryExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = RetryExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = RetryExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = RetryExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = RetryExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = RetryExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('RetryThreshold', () => {
    it('should create within bounds', () => {
      var t = RetryThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => RetryThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = RetryThreshold.create(10);
      var high = RetryThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('RetryTimeWindow', () => {
    it('should create from minutes', () => {
      var w = RetryTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = RetryTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = RetryTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => RetryTimeWindow.create(100, 0)).toThrow();
      expect(() => RetryTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('RetryPriority', () => {
    it('should create with valid value', () => {
      var p1 = RetryPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => RetryPriority.create(15)).toThrow();
      expect(() => RetryPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(RetryPriority.low().isLow()).toBe(true);
      expect(RetryPriority.medium().isMedium()).toBe(true);
      expect(RetryPriority.high().isHigh()).toBe(true);
      expect(RetryPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('RetryExecuted Event', () => {
    it('should create event', () => {
      var ev = RetryExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = RetryExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('RetryFailed Event', () => {
    it('should create failed event', () => {
      var ev = RetryFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
