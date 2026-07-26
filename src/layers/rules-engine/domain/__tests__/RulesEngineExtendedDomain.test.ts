/**
 * Extended domain tests for RulesEngine
 */

import { RulesEngineExecution } from '../entities/RulesEngineExecution';
import { RulesEngineConfigState as RulesEngineConfigEntity } from '../entities/RulesEngineConfigState';
import { RulesEngineMetricsSnapshot } from '../entities/RulesEngineMetricsSnapshot';
import { RulesEngineThreshold } from '../value-objects/RulesEngineThreshold';
import { RulesEngineTimeWindow } from '../value-objects/RulesEngineTimeWindow';
import { RulesEnginePriority } from '../value-objects/RulesEnginePriority';
import { RulesEngineExecuted } from '../events/RulesEngineExecuted';
import { RulesEngineFailed } from '../events/RulesEngineFailed';

describe('Extended Domain: RulesEngine', () => {
  describe('RulesEngineExecution', () => {
    it('should create with pending status', () => {
      var exec = RulesEngineExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = RulesEngineExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = RulesEngineExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = RulesEngineExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = RulesEngineExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = RulesEngineExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('RulesEngineThreshold', () => {
    it('should create within bounds', () => {
      var t = RulesEngineThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => RulesEngineThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = RulesEngineThreshold.create(10);
      var high = RulesEngineThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('RulesEngineTimeWindow', () => {
    it('should create from minutes', () => {
      var w = RulesEngineTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = RulesEngineTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = RulesEngineTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => RulesEngineTimeWindow.create(100, 0)).toThrow();
      expect(() => RulesEngineTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('RulesEnginePriority', () => {
    it('should create with valid value', () => {
      var p1 = RulesEnginePriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => RulesEnginePriority.create(15)).toThrow();
      expect(() => RulesEnginePriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(RulesEnginePriority.low().isLow()).toBe(true);
      expect(RulesEnginePriority.medium().isMedium()).toBe(true);
      expect(RulesEnginePriority.high().isHigh()).toBe(true);
      expect(RulesEnginePriority.critical().isCritical()).toBe(true);
    });
  });

  describe('RulesEngineExecuted Event', () => {
    it('should create event', () => {
      var ev = RulesEngineExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = RulesEngineExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('RulesEngineFailed Event', () => {
    it('should create failed event', () => {
      var ev = RulesEngineFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
