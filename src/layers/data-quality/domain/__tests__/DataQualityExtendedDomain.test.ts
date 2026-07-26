/**
 * Extended domain tests for DataQuality
 */

import { DataQualityExecution } from '../entities/DataQualityExecution';
import { DataQualityConfigState as DataQualityConfigEntity } from '../entities/DataQualityConfigState';
import { DataQualityMetricsSnapshot } from '../entities/DataQualityMetricsSnapshot';
import { DataQualityThreshold } from '../value-objects/DataQualityThreshold';
import { DataQualityTimeWindow } from '../value-objects/DataQualityTimeWindow';
import { DataQualityPriority } from '../value-objects/DataQualityPriority';
import { DataQualityExecuted } from '../events/DataQualityExecuted';
import { DataQualityFailed } from '../events/DataQualityFailed';

describe('Extended Domain: DataQuality', () => {
  describe('DataQualityExecution', () => {
    it('should create with pending status', () => {
      var exec = DataQualityExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = DataQualityExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = DataQualityExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = DataQualityExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = DataQualityExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = DataQualityExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('DataQualityThreshold', () => {
    it('should create within bounds', () => {
      var t = DataQualityThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => DataQualityThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = DataQualityThreshold.create(10);
      var high = DataQualityThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('DataQualityTimeWindow', () => {
    it('should create from minutes', () => {
      var w = DataQualityTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = DataQualityTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = DataQualityTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => DataQualityTimeWindow.create(100, 0)).toThrow();
      expect(() => DataQualityTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('DataQualityPriority', () => {
    it('should create with valid value', () => {
      var p1 = DataQualityPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => DataQualityPriority.create(15)).toThrow();
      expect(() => DataQualityPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(DataQualityPriority.low().isLow()).toBe(true);
      expect(DataQualityPriority.medium().isMedium()).toBe(true);
      expect(DataQualityPriority.high().isHigh()).toBe(true);
      expect(DataQualityPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('DataQualityExecuted Event', () => {
    it('should create event', () => {
      var ev = DataQualityExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = DataQualityExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('DataQualityFailed Event', () => {
    it('should create failed event', () => {
      var ev = DataQualityFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
