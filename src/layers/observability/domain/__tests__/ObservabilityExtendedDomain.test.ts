/**
 * Extended domain tests for Observability
 */

import { ObservabilityExecution } from '../entities/ObservabilityExecution';
import { ObservabilityConfigState as ObservabilityConfigEntity } from '../entities/ObservabilityConfigState';
import { ObservabilityMetricsSnapshot } from '../entities/ObservabilityMetricsSnapshot';
import { ObservabilityThreshold } from '../value-objects/ObservabilityThreshold';
import { ObservabilityTimeWindow } from '../value-objects/ObservabilityTimeWindow';
import { ObservabilityPriority } from '../value-objects/ObservabilityPriority';
import { ObservabilityExecuted } from '../events/ObservabilityExecuted';
import { ObservabilityFailed } from '../events/ObservabilityFailed';

describe('Extended Domain: Observability', () => {
  describe('ObservabilityExecution', () => {
    it('should create with pending status', () => {
      var exec = ObservabilityExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = ObservabilityExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = ObservabilityExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = ObservabilityExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = ObservabilityExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = ObservabilityExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('ObservabilityThreshold', () => {
    it('should create within bounds', () => {
      var t = ObservabilityThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => ObservabilityThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = ObservabilityThreshold.create(10);
      var high = ObservabilityThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('ObservabilityTimeWindow', () => {
    it('should create from minutes', () => {
      var w = ObservabilityTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = ObservabilityTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = ObservabilityTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => ObservabilityTimeWindow.create(100, 0)).toThrow();
      expect(() => ObservabilityTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('ObservabilityPriority', () => {
    it('should create with valid value', () => {
      var p1 = ObservabilityPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => ObservabilityPriority.create(15)).toThrow();
      expect(() => ObservabilityPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(ObservabilityPriority.low().isLow()).toBe(true);
      expect(ObservabilityPriority.medium().isMedium()).toBe(true);
      expect(ObservabilityPriority.high().isHigh()).toBe(true);
      expect(ObservabilityPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('ObservabilityExecuted Event', () => {
    it('should create event', () => {
      var ev = ObservabilityExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = ObservabilityExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('ObservabilityFailed Event', () => {
    it('should create failed event', () => {
      var ev = ObservabilityFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
