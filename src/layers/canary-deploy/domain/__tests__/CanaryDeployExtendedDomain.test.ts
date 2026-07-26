/**
 * Extended domain tests for CanaryDeploy
 */

import { CanaryDeployExecution } from '../entities/CanaryDeployExecution';
import { CanaryDeployConfigState as CanaryDeployConfigEntity } from '../entities/CanaryDeployConfigState';
import { CanaryDeployMetricsSnapshot } from '../entities/CanaryDeployMetricsSnapshot';
import { CanaryDeployThreshold } from '../value-objects/CanaryDeployThreshold';
import { CanaryDeployTimeWindow } from '../value-objects/CanaryDeployTimeWindow';
import { CanaryDeployPriority } from '../value-objects/CanaryDeployPriority';
import { CanaryDeployExecuted } from '../events/CanaryDeployExecuted';
import { CanaryDeployFailed } from '../events/CanaryDeployFailed';

describe('Extended Domain: CanaryDeploy', () => {
  describe('CanaryDeployExecution', () => {
    it('should create with pending status', () => {
      var exec = CanaryDeployExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = CanaryDeployExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = CanaryDeployExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = CanaryDeployExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = CanaryDeployExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = CanaryDeployExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('CanaryDeployThreshold', () => {
    it('should create within bounds', () => {
      var t = CanaryDeployThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => CanaryDeployThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = CanaryDeployThreshold.create(10);
      var high = CanaryDeployThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('CanaryDeployTimeWindow', () => {
    it('should create from minutes', () => {
      var w = CanaryDeployTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = CanaryDeployTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = CanaryDeployTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => CanaryDeployTimeWindow.create(100, 0)).toThrow();
      expect(() => CanaryDeployTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('CanaryDeployPriority', () => {
    it('should create with valid value', () => {
      var p1 = CanaryDeployPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => CanaryDeployPriority.create(15)).toThrow();
      expect(() => CanaryDeployPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(CanaryDeployPriority.low().isLow()).toBe(true);
      expect(CanaryDeployPriority.medium().isMedium()).toBe(true);
      expect(CanaryDeployPriority.high().isHigh()).toBe(true);
      expect(CanaryDeployPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('CanaryDeployExecuted Event', () => {
    it('should create event', () => {
      var ev = CanaryDeployExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = CanaryDeployExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('CanaryDeployFailed Event', () => {
    it('should create failed event', () => {
      var ev = CanaryDeployFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
