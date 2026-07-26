/**
 * Extended domain tests for PolicyEngine
 */

import { PolicyEngineExecution } from '../entities/PolicyEngineExecution';
import { PolicyEngineConfigState as PolicyEngineConfigEntity } from '../entities/PolicyEngineConfigState';
import { PolicyEngineMetricsSnapshot } from '../entities/PolicyEngineMetricsSnapshot';
import { PolicyEngineThreshold } from '../value-objects/PolicyEngineThreshold';
import { PolicyEngineTimeWindow } from '../value-objects/PolicyEngineTimeWindow';
import { PolicyEnginePriority } from '../value-objects/PolicyEnginePriority';
import { PolicyEngineExecuted } from '../events/PolicyEngineExecuted';
import { PolicyEngineFailed } from '../events/PolicyEngineFailed';

describe('Extended Domain: PolicyEngine', () => {
  describe('PolicyEngineExecution', () => {
    it('should create with pending status', () => {
      var exec = PolicyEngineExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = PolicyEngineExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = PolicyEngineExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = PolicyEngineExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = PolicyEngineExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = PolicyEngineExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('PolicyEngineThreshold', () => {
    it('should create within bounds', () => {
      var t = PolicyEngineThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => PolicyEngineThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = PolicyEngineThreshold.create(10);
      var high = PolicyEngineThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('PolicyEngineTimeWindow', () => {
    it('should create from minutes', () => {
      var w = PolicyEngineTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = PolicyEngineTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = PolicyEngineTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => PolicyEngineTimeWindow.create(100, 0)).toThrow();
      expect(() => PolicyEngineTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('PolicyEnginePriority', () => {
    it('should create with valid value', () => {
      var p1 = PolicyEnginePriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => PolicyEnginePriority.create(15)).toThrow();
      expect(() => PolicyEnginePriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(PolicyEnginePriority.low().isLow()).toBe(true);
      expect(PolicyEnginePriority.medium().isMedium()).toBe(true);
      expect(PolicyEnginePriority.high().isHigh()).toBe(true);
      expect(PolicyEnginePriority.critical().isCritical()).toBe(true);
    });
  });

  describe('PolicyEngineExecuted Event', () => {
    it('should create event', () => {
      var ev = PolicyEngineExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = PolicyEngineExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('PolicyEngineFailed Event', () => {
    it('should create failed event', () => {
      var ev = PolicyEngineFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
