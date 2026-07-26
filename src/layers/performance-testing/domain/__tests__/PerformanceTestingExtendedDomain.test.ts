/**
 * Extended domain tests for PerformanceTesting
 */

import { PerformanceTestingExecution } from '../entities/PerformanceTestingExecution';
import { PerformanceTestingConfigState as PerformanceTestingConfigEntity } from '../entities/PerformanceTestingConfigState';
import { PerformanceTestingMetricsSnapshot } from '../entities/PerformanceTestingMetricsSnapshot';
import { PerformanceTestingThreshold } from '../value-objects/PerformanceTestingThreshold';
import { PerformanceTestingTimeWindow } from '../value-objects/PerformanceTestingTimeWindow';
import { PerformanceTestingPriority } from '../value-objects/PerformanceTestingPriority';
import { PerformanceTestingExecuted } from '../events/PerformanceTestingExecuted';
import { PerformanceTestingFailed } from '../events/PerformanceTestingFailed';

describe('Extended Domain: PerformanceTesting', () => {
  describe('PerformanceTestingExecution', () => {
    it('should create with pending status', () => {
      var exec = PerformanceTestingExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = PerformanceTestingExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = PerformanceTestingExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = PerformanceTestingExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = PerformanceTestingExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = PerformanceTestingExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('PerformanceTestingThreshold', () => {
    it('should create within bounds', () => {
      var t = PerformanceTestingThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => PerformanceTestingThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = PerformanceTestingThreshold.create(10);
      var high = PerformanceTestingThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('PerformanceTestingTimeWindow', () => {
    it('should create from minutes', () => {
      var w = PerformanceTestingTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = PerformanceTestingTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = PerformanceTestingTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => PerformanceTestingTimeWindow.create(100, 0)).toThrow();
      expect(() => PerformanceTestingTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('PerformanceTestingPriority', () => {
    it('should create with valid value', () => {
      var p1 = PerformanceTestingPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => PerformanceTestingPriority.create(15)).toThrow();
      expect(() => PerformanceTestingPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(PerformanceTestingPriority.low().isLow()).toBe(true);
      expect(PerformanceTestingPriority.medium().isMedium()).toBe(true);
      expect(PerformanceTestingPriority.high().isHigh()).toBe(true);
      expect(PerformanceTestingPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('PerformanceTestingExecuted Event', () => {
    it('should create event', () => {
      var ev = PerformanceTestingExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = PerformanceTestingExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('PerformanceTestingFailed Event', () => {
    it('should create failed event', () => {
      var ev = PerformanceTestingFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
