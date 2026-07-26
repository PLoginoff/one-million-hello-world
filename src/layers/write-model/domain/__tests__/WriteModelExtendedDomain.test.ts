/**
 * Extended domain tests for WriteModel
 */

import { WriteModelExecution } from '../entities/WriteModelExecution';
import { WriteModelConfigState as WriteModelConfigEntity } from '../entities/WriteModelConfigState';
import { WriteModelMetricsSnapshot } from '../entities/WriteModelMetricsSnapshot';
import { WriteModelThreshold } from '../value-objects/WriteModelThreshold';
import { WriteModelTimeWindow } from '../value-objects/WriteModelTimeWindow';
import { WriteModelPriority } from '../value-objects/WriteModelPriority';
import { WriteModelExecuted } from '../events/WriteModelExecuted';
import { WriteModelFailed } from '../events/WriteModelFailed';

describe('Extended Domain: WriteModel', () => {
  describe('WriteModelExecution', () => {
    it('should create with pending status', () => {
      var exec = WriteModelExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = WriteModelExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = WriteModelExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = WriteModelExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = WriteModelExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = WriteModelExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('WriteModelThreshold', () => {
    it('should create within bounds', () => {
      var t = WriteModelThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => WriteModelThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = WriteModelThreshold.create(10);
      var high = WriteModelThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('WriteModelTimeWindow', () => {
    it('should create from minutes', () => {
      var w = WriteModelTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = WriteModelTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = WriteModelTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => WriteModelTimeWindow.create(100, 0)).toThrow();
      expect(() => WriteModelTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('WriteModelPriority', () => {
    it('should create with valid value', () => {
      var p1 = WriteModelPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => WriteModelPriority.create(15)).toThrow();
      expect(() => WriteModelPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(WriteModelPriority.low().isLow()).toBe(true);
      expect(WriteModelPriority.medium().isMedium()).toBe(true);
      expect(WriteModelPriority.high().isHigh()).toBe(true);
      expect(WriteModelPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('WriteModelExecuted Event', () => {
    it('should create event', () => {
      var ev = WriteModelExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = WriteModelExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('WriteModelFailed Event', () => {
    it('should create failed event', () => {
      var ev = WriteModelFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
