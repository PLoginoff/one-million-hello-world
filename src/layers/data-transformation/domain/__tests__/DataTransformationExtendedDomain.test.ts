/**
 * Extended domain tests for DataTransformation
 */

import { DataTransformationExecution } from '../entities/DataTransformationExecution';
import { DataTransformationConfigState as DataTransformationConfigEntity } from '../entities/DataTransformationConfigState';
import { DataTransformationMetricsSnapshot } from '../entities/DataTransformationMetricsSnapshot';
import { DataTransformationThreshold } from '../value-objects/DataTransformationThreshold';
import { DataTransformationTimeWindow } from '../value-objects/DataTransformationTimeWindow';
import { DataTransformationPriority } from '../value-objects/DataTransformationPriority';
import { DataTransformationExecuted } from '../events/DataTransformationExecuted';
import { DataTransformationFailed } from '../events/DataTransformationFailed';

describe('Extended Domain: DataTransformation', () => {
  describe('DataTransformationExecution', () => {
    it('should create with pending status', () => {
      var exec = DataTransformationExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = DataTransformationExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = DataTransformationExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = DataTransformationExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = DataTransformationExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = DataTransformationExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('DataTransformationThreshold', () => {
    it('should create within bounds', () => {
      var t = DataTransformationThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => DataTransformationThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = DataTransformationThreshold.create(10);
      var high = DataTransformationThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('DataTransformationTimeWindow', () => {
    it('should create from minutes', () => {
      var w = DataTransformationTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = DataTransformationTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = DataTransformationTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => DataTransformationTimeWindow.create(100, 0)).toThrow();
      expect(() => DataTransformationTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('DataTransformationPriority', () => {
    it('should create with valid value', () => {
      var p1 = DataTransformationPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => DataTransformationPriority.create(15)).toThrow();
      expect(() => DataTransformationPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(DataTransformationPriority.low().isLow()).toBe(true);
      expect(DataTransformationPriority.medium().isMedium()).toBe(true);
      expect(DataTransformationPriority.high().isHigh()).toBe(true);
      expect(DataTransformationPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('DataTransformationExecuted Event', () => {
    it('should create event', () => {
      var ev = DataTransformationExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = DataTransformationExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('DataTransformationFailed Event', () => {
    it('should create failed event', () => {
      var ev = DataTransformationFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
