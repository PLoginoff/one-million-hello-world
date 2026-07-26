/**
 * Extended domain tests for CostOptimization
 */

import { CostOptimizationExecution } from '../entities/CostOptimizationExecution';
import { CostOptimizationConfigState as CostOptimizationConfigEntity } from '../entities/CostOptimizationConfigState';
import { CostOptimizationMetricsSnapshot } from '../entities/CostOptimizationMetricsSnapshot';
import { CostOptimizationThreshold } from '../value-objects/CostOptimizationThreshold';
import { CostOptimizationTimeWindow } from '../value-objects/CostOptimizationTimeWindow';
import { CostOptimizationPriority } from '../value-objects/CostOptimizationPriority';
import { CostOptimizationExecuted } from '../events/CostOptimizationExecuted';
import { CostOptimizationFailed } from '../events/CostOptimizationFailed';

describe('Extended Domain: CostOptimization', () => {
  describe('CostOptimizationExecution', () => {
    it('should create with pending status', () => {
      var exec = CostOptimizationExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = CostOptimizationExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = CostOptimizationExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = CostOptimizationExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = CostOptimizationExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = CostOptimizationExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('CostOptimizationThreshold', () => {
    it('should create within bounds', () => {
      var t = CostOptimizationThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => CostOptimizationThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = CostOptimizationThreshold.create(10);
      var high = CostOptimizationThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('CostOptimizationTimeWindow', () => {
    it('should create from minutes', () => {
      var w = CostOptimizationTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = CostOptimizationTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = CostOptimizationTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => CostOptimizationTimeWindow.create(100, 0)).toThrow();
      expect(() => CostOptimizationTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('CostOptimizationPriority', () => {
    it('should create with valid value', () => {
      var p1 = CostOptimizationPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => CostOptimizationPriority.create(15)).toThrow();
      expect(() => CostOptimizationPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(CostOptimizationPriority.low().isLow()).toBe(true);
      expect(CostOptimizationPriority.medium().isMedium()).toBe(true);
      expect(CostOptimizationPriority.high().isHigh()).toBe(true);
      expect(CostOptimizationPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('CostOptimizationExecuted Event', () => {
    it('should create event', () => {
      var ev = CostOptimizationExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = CostOptimizationExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('CostOptimizationFailed Event', () => {
    it('should create failed event', () => {
      var ev = CostOptimizationFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
