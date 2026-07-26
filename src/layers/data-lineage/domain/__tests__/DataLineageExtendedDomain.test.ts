/**
 * Extended domain tests for DataLineage
 */

import { DataLineageExecution } from '../entities/DataLineageExecution';
import { DataLineageConfigState as DataLineageConfigEntity } from '../entities/DataLineageConfigState';
import { DataLineageMetricsSnapshot } from '../entities/DataLineageMetricsSnapshot';
import { DataLineageThreshold } from '../value-objects/DataLineageThreshold';
import { DataLineageTimeWindow } from '../value-objects/DataLineageTimeWindow';
import { DataLineagePriority } from '../value-objects/DataLineagePriority';
import { DataLineageExecuted } from '../events/DataLineageExecuted';
import { DataLineageFailed } from '../events/DataLineageFailed';

describe('Extended Domain: DataLineage', () => {
  describe('DataLineageExecution', () => {
    it('should create with pending status', () => {
      var exec = DataLineageExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = DataLineageExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = DataLineageExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = DataLineageExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = DataLineageExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = DataLineageExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('DataLineageThreshold', () => {
    it('should create within bounds', () => {
      var t = DataLineageThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => DataLineageThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = DataLineageThreshold.create(10);
      var high = DataLineageThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('DataLineageTimeWindow', () => {
    it('should create from minutes', () => {
      var w = DataLineageTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = DataLineageTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = DataLineageTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => DataLineageTimeWindow.create(100, 0)).toThrow();
      expect(() => DataLineageTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('DataLineagePriority', () => {
    it('should create with valid value', () => {
      var p1 = DataLineagePriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => DataLineagePriority.create(15)).toThrow();
      expect(() => DataLineagePriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(DataLineagePriority.low().isLow()).toBe(true);
      expect(DataLineagePriority.medium().isMedium()).toBe(true);
      expect(DataLineagePriority.high().isHigh()).toBe(true);
      expect(DataLineagePriority.critical().isCritical()).toBe(true);
    });
  });

  describe('DataLineageExecuted Event', () => {
    it('should create event', () => {
      var ev = DataLineageExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = DataLineageExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('DataLineageFailed Event', () => {
    it('should create failed event', () => {
      var ev = DataLineageFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
