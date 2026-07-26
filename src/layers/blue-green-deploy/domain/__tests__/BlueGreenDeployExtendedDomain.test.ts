/**
 * Extended domain tests for BlueGreenDeploy
 */

import { BlueGreenDeployExecution } from '../entities/BlueGreenDeployExecution';
import { BlueGreenDeployConfigState as BlueGreenDeployConfigEntity } from '../entities/BlueGreenDeployConfigState';
import { BlueGreenDeployMetricsSnapshot } from '../entities/BlueGreenDeployMetricsSnapshot';
import { BlueGreenDeployThreshold } from '../value-objects/BlueGreenDeployThreshold';
import { BlueGreenDeployTimeWindow } from '../value-objects/BlueGreenDeployTimeWindow';
import { BlueGreenDeployPriority } from '../value-objects/BlueGreenDeployPriority';
import { BlueGreenDeployExecuted } from '../events/BlueGreenDeployExecuted';
import { BlueGreenDeployFailed } from '../events/BlueGreenDeployFailed';

describe('Extended Domain: BlueGreenDeploy', () => {
  describe('BlueGreenDeployExecution', () => {
    it('should create with pending status', () => {
      var exec = BlueGreenDeployExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = BlueGreenDeployExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = BlueGreenDeployExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = BlueGreenDeployExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = BlueGreenDeployExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = BlueGreenDeployExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('BlueGreenDeployThreshold', () => {
    it('should create within bounds', () => {
      var t = BlueGreenDeployThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => BlueGreenDeployThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = BlueGreenDeployThreshold.create(10);
      var high = BlueGreenDeployThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('BlueGreenDeployTimeWindow', () => {
    it('should create from minutes', () => {
      var w = BlueGreenDeployTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = BlueGreenDeployTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = BlueGreenDeployTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => BlueGreenDeployTimeWindow.create(100, 0)).toThrow();
      expect(() => BlueGreenDeployTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('BlueGreenDeployPriority', () => {
    it('should create with valid value', () => {
      var p1 = BlueGreenDeployPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => BlueGreenDeployPriority.create(15)).toThrow();
      expect(() => BlueGreenDeployPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(BlueGreenDeployPriority.low().isLow()).toBe(true);
      expect(BlueGreenDeployPriority.medium().isMedium()).toBe(true);
      expect(BlueGreenDeployPriority.high().isHigh()).toBe(true);
      expect(BlueGreenDeployPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('BlueGreenDeployExecuted Event', () => {
    it('should create event', () => {
      var ev = BlueGreenDeployExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = BlueGreenDeployExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('BlueGreenDeployFailed Event', () => {
    it('should create failed event', () => {
      var ev = BlueGreenDeployFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
