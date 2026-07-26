/**
 * Extended domain tests for ReadModel
 */

import { ReadModelExecution } from '../entities/ReadModelExecution';
import { ReadModelConfigState as ReadModelConfigEntity } from '../entities/ReadModelConfigState';
import { ReadModelMetricsSnapshot } from '../entities/ReadModelMetricsSnapshot';
import { ReadModelThreshold } from '../value-objects/ReadModelThreshold';
import { ReadModelTimeWindow } from '../value-objects/ReadModelTimeWindow';
import { ReadModelPriority } from '../value-objects/ReadModelPriority';
import { ReadModelExecuted } from '../events/ReadModelExecuted';
import { ReadModelFailed } from '../events/ReadModelFailed';

describe('Extended Domain: ReadModel', () => {
  describe('ReadModelExecution', () => {
    it('should create with pending status', () => {
      var exec = ReadModelExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = ReadModelExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = ReadModelExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = ReadModelExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = ReadModelExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = ReadModelExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('ReadModelThreshold', () => {
    it('should create within bounds', () => {
      var t = ReadModelThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => ReadModelThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = ReadModelThreshold.create(10);
      var high = ReadModelThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('ReadModelTimeWindow', () => {
    it('should create from minutes', () => {
      var w = ReadModelTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = ReadModelTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = ReadModelTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => ReadModelTimeWindow.create(100, 0)).toThrow();
      expect(() => ReadModelTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('ReadModelPriority', () => {
    it('should create with valid value', () => {
      var p1 = ReadModelPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => ReadModelPriority.create(15)).toThrow();
      expect(() => ReadModelPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(ReadModelPriority.low().isLow()).toBe(true);
      expect(ReadModelPriority.medium().isMedium()).toBe(true);
      expect(ReadModelPriority.high().isHigh()).toBe(true);
      expect(ReadModelPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('ReadModelExecuted Event', () => {
    it('should create event', () => {
      var ev = ReadModelExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = ReadModelExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('ReadModelFailed Event', () => {
    it('should create failed event', () => {
      var ev = ReadModelFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
