/**
 * Extended domain tests for FeatureFlags
 */

import { FeatureFlagsExecution } from '../entities/FeatureFlagsExecution';
import { FeatureFlagsConfigState as FeatureFlagsConfigEntity } from '../entities/FeatureFlagsConfigState';
import { FeatureFlagsMetricsSnapshot } from '../entities/FeatureFlagsMetricsSnapshot';
import { FeatureFlagsThreshold } from '../value-objects/FeatureFlagsThreshold';
import { FeatureFlagsTimeWindow } from '../value-objects/FeatureFlagsTimeWindow';
import { FeatureFlagsPriority } from '../value-objects/FeatureFlagsPriority';
import { FeatureFlagsExecuted } from '../events/FeatureFlagsExecuted';
import { FeatureFlagsFailed } from '../events/FeatureFlagsFailed';

describe('Extended Domain: FeatureFlags', () => {
  describe('FeatureFlagsExecution', () => {
    it('should create with pending status', () => {
      var exec = FeatureFlagsExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = FeatureFlagsExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = FeatureFlagsExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = FeatureFlagsExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = FeatureFlagsExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = FeatureFlagsExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('FeatureFlagsThreshold', () => {
    it('should create within bounds', () => {
      var t = FeatureFlagsThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => FeatureFlagsThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = FeatureFlagsThreshold.create(10);
      var high = FeatureFlagsThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('FeatureFlagsTimeWindow', () => {
    it('should create from minutes', () => {
      var w = FeatureFlagsTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = FeatureFlagsTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = FeatureFlagsTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => FeatureFlagsTimeWindow.create(100, 0)).toThrow();
      expect(() => FeatureFlagsTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('FeatureFlagsPriority', () => {
    it('should create with valid value', () => {
      var p1 = FeatureFlagsPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => FeatureFlagsPriority.create(15)).toThrow();
      expect(() => FeatureFlagsPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(FeatureFlagsPriority.low().isLow()).toBe(true);
      expect(FeatureFlagsPriority.medium().isMedium()).toBe(true);
      expect(FeatureFlagsPriority.high().isHigh()).toBe(true);
      expect(FeatureFlagsPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('FeatureFlagsExecuted Event', () => {
    it('should create event', () => {
      var ev = FeatureFlagsExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = FeatureFlagsExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('FeatureFlagsFailed Event', () => {
    it('should create failed event', () => {
      var ev = FeatureFlagsFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
