/**
 * Extended domain tests for DataLake
 */

import { DataLakeExecution } from '../entities/DataLakeExecution';
import { DataLakeConfigState as DataLakeConfigEntity } from '../entities/DataLakeConfigState';
import { DataLakeMetricsSnapshot } from '../entities/DataLakeMetricsSnapshot';
import { DataLakeThreshold } from '../value-objects/DataLakeThreshold';
import { DataLakeTimeWindow } from '../value-objects/DataLakeTimeWindow';
import { DataLakePriority } from '../value-objects/DataLakePriority';
import { DataLakeExecuted } from '../events/DataLakeExecuted';
import { DataLakeFailed } from '../events/DataLakeFailed';

describe('Extended Domain: DataLake', () => {
  describe('DataLakeExecution', () => {
    it('should create with pending status', () => {
      var exec = DataLakeExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = DataLakeExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = DataLakeExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = DataLakeExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = DataLakeExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = DataLakeExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('DataLakeThreshold', () => {
    it('should create within bounds', () => {
      var t = DataLakeThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => DataLakeThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = DataLakeThreshold.create(10);
      var high = DataLakeThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('DataLakeTimeWindow', () => {
    it('should create from minutes', () => {
      var w = DataLakeTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = DataLakeTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = DataLakeTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => DataLakeTimeWindow.create(100, 0)).toThrow();
      expect(() => DataLakeTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('DataLakePriority', () => {
    it('should create with valid value', () => {
      var p1 = DataLakePriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => DataLakePriority.create(15)).toThrow();
      expect(() => DataLakePriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(DataLakePriority.low().isLow()).toBe(true);
      expect(DataLakePriority.medium().isMedium()).toBe(true);
      expect(DataLakePriority.high().isHigh()).toBe(true);
      expect(DataLakePriority.critical().isCritical()).toBe(true);
    });
  });

  describe('DataLakeExecuted Event', () => {
    it('should create event', () => {
      var ev = DataLakeExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = DataLakeExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('DataLakeFailed Event', () => {
    it('should create failed event', () => {
      var ev = DataLakeFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
