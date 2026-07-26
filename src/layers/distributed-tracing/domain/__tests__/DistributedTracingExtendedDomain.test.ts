/**
 * Extended domain tests for DistributedTracing
 */

import { DistributedTracingExecution } from '../entities/DistributedTracingExecution';
import { DistributedTracingConfigState as DistributedTracingConfigEntity } from '../entities/DistributedTracingConfigState';
import { DistributedTracingMetricsSnapshot } from '../entities/DistributedTracingMetricsSnapshot';
import { DistributedTracingThreshold } from '../value-objects/DistributedTracingThreshold';
import { DistributedTracingTimeWindow } from '../value-objects/DistributedTracingTimeWindow';
import { DistributedTracingPriority } from '../value-objects/DistributedTracingPriority';
import { DistributedTracingExecuted } from '../events/DistributedTracingExecuted';
import { DistributedTracingFailed } from '../events/DistributedTracingFailed';

describe('Extended Domain: DistributedTracing', () => {
  describe('DistributedTracingExecution', () => {
    it('should create with pending status', () => {
      var exec = DistributedTracingExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = DistributedTracingExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = DistributedTracingExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = DistributedTracingExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = DistributedTracingExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = DistributedTracingExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('DistributedTracingThreshold', () => {
    it('should create within bounds', () => {
      var t = DistributedTracingThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => DistributedTracingThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = DistributedTracingThreshold.create(10);
      var high = DistributedTracingThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('DistributedTracingTimeWindow', () => {
    it('should create from minutes', () => {
      var w = DistributedTracingTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = DistributedTracingTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = DistributedTracingTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => DistributedTracingTimeWindow.create(100, 0)).toThrow();
      expect(() => DistributedTracingTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('DistributedTracingPriority', () => {
    it('should create with valid value', () => {
      var p1 = DistributedTracingPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => DistributedTracingPriority.create(15)).toThrow();
      expect(() => DistributedTracingPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(DistributedTracingPriority.low().isLow()).toBe(true);
      expect(DistributedTracingPriority.medium().isMedium()).toBe(true);
      expect(DistributedTracingPriority.high().isHigh()).toBe(true);
      expect(DistributedTracingPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('DistributedTracingExecuted Event', () => {
    it('should create event', () => {
      var ev = DistributedTracingExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = DistributedTracingExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('DistributedTracingFailed Event', () => {
    it('should create failed event', () => {
      var ev = DistributedTracingFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
