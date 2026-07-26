/**
 * Extended domain tests for BatchProcessing
 */

import { BatchProcessingExecution } from '../entities/BatchProcessingExecution';
import { BatchProcessingConfigState as BatchProcessingConfigEntity } from '../entities/BatchProcessingConfigState';
import { BatchProcessingMetricsSnapshot } from '../entities/BatchProcessingMetricsSnapshot';
import { BatchProcessingThreshold } from '../value-objects/BatchProcessingThreshold';
import { BatchProcessingTimeWindow } from '../value-objects/BatchProcessingTimeWindow';
import { BatchProcessingPriority } from '../value-objects/BatchProcessingPriority';
import { BatchProcessingExecuted } from '../events/BatchProcessingExecuted';
import { BatchProcessingFailed } from '../events/BatchProcessingFailed';

describe('Extended Domain: BatchProcessing', () => {
  describe('BatchProcessingExecution', () => {
    it('should create with pending status', () => {
      var exec = BatchProcessingExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = BatchProcessingExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = BatchProcessingExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = BatchProcessingExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = BatchProcessingExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = BatchProcessingExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('BatchProcessingThreshold', () => {
    it('should create within bounds', () => {
      var t = BatchProcessingThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => BatchProcessingThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = BatchProcessingThreshold.create(10);
      var high = BatchProcessingThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('BatchProcessingTimeWindow', () => {
    it('should create from minutes', () => {
      var w = BatchProcessingTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = BatchProcessingTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = BatchProcessingTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => BatchProcessingTimeWindow.create(100, 0)).toThrow();
      expect(() => BatchProcessingTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('BatchProcessingPriority', () => {
    it('should create with valid value', () => {
      var p1 = BatchProcessingPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => BatchProcessingPriority.create(15)).toThrow();
      expect(() => BatchProcessingPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(BatchProcessingPriority.low().isLow()).toBe(true);
      expect(BatchProcessingPriority.medium().isMedium()).toBe(true);
      expect(BatchProcessingPriority.high().isHigh()).toBe(true);
      expect(BatchProcessingPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('BatchProcessingExecuted Event', () => {
    it('should create event', () => {
      var ev = BatchProcessingExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = BatchProcessingExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('BatchProcessingFailed Event', () => {
    it('should create failed event', () => {
      var ev = BatchProcessingFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
