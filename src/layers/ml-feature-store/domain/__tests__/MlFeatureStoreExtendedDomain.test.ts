/**
 * Extended domain tests for MlFeatureStore
 */

import { MlFeatureStoreExecution } from '../entities/MlFeatureStoreExecution';
import { MlFeatureStoreConfigState as MlFeatureStoreConfigEntity } from '../entities/MlFeatureStoreConfigState';
import { MlFeatureStoreMetricsSnapshot } from '../entities/MlFeatureStoreMetricsSnapshot';
import { MlFeatureStoreThreshold } from '../value-objects/MlFeatureStoreThreshold';
import { MlFeatureStoreTimeWindow } from '../value-objects/MlFeatureStoreTimeWindow';
import { MlFeatureStorePriority } from '../value-objects/MlFeatureStorePriority';
import { MlFeatureStoreExecuted } from '../events/MlFeatureStoreExecuted';
import { MlFeatureStoreFailed } from '../events/MlFeatureStoreFailed';

describe('Extended Domain: MlFeatureStore', () => {
  describe('MlFeatureStoreExecution', () => {
    it('should create with pending status', () => {
      var exec = MlFeatureStoreExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = MlFeatureStoreExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = MlFeatureStoreExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = MlFeatureStoreExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = MlFeatureStoreExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = MlFeatureStoreExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('MlFeatureStoreThreshold', () => {
    it('should create within bounds', () => {
      var t = MlFeatureStoreThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => MlFeatureStoreThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = MlFeatureStoreThreshold.create(10);
      var high = MlFeatureStoreThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('MlFeatureStoreTimeWindow', () => {
    it('should create from minutes', () => {
      var w = MlFeatureStoreTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = MlFeatureStoreTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = MlFeatureStoreTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => MlFeatureStoreTimeWindow.create(100, 0)).toThrow();
      expect(() => MlFeatureStoreTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('MlFeatureStorePriority', () => {
    it('should create with valid value', () => {
      var p1 = MlFeatureStorePriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => MlFeatureStorePriority.create(15)).toThrow();
      expect(() => MlFeatureStorePriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(MlFeatureStorePriority.low().isLow()).toBe(true);
      expect(MlFeatureStorePriority.medium().isMedium()).toBe(true);
      expect(MlFeatureStorePriority.high().isHigh()).toBe(true);
      expect(MlFeatureStorePriority.critical().isCritical()).toBe(true);
    });
  });

  describe('MlFeatureStoreExecuted Event', () => {
    it('should create event', () => {
      var ev = MlFeatureStoreExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = MlFeatureStoreExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('MlFeatureStoreFailed Event', () => {
    it('should create failed event', () => {
      var ev = MlFeatureStoreFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
