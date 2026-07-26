/**
 * Extended domain tests for WorkflowEngine
 */

import { WorkflowEngineExecution } from '../entities/WorkflowEngineExecution';
import { WorkflowEngineConfigState as WorkflowEngineConfigEntity } from '../entities/WorkflowEngineConfigState';
import { WorkflowEngineMetricsSnapshot } from '../entities/WorkflowEngineMetricsSnapshot';
import { WorkflowEngineThreshold } from '../value-objects/WorkflowEngineThreshold';
import { WorkflowEngineTimeWindow } from '../value-objects/WorkflowEngineTimeWindow';
import { WorkflowEnginePriority } from '../value-objects/WorkflowEnginePriority';
import { WorkflowEngineExecuted } from '../events/WorkflowEngineExecuted';
import { WorkflowEngineFailed } from '../events/WorkflowEngineFailed';

describe('Extended Domain: WorkflowEngine', () => {
  describe('WorkflowEngineExecution', () => {
    it('should create with pending status', () => {
      var exec = WorkflowEngineExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = WorkflowEngineExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = WorkflowEngineExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = WorkflowEngineExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = WorkflowEngineExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = WorkflowEngineExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('WorkflowEngineThreshold', () => {
    it('should create within bounds', () => {
      var t = WorkflowEngineThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => WorkflowEngineThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = WorkflowEngineThreshold.create(10);
      var high = WorkflowEngineThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('WorkflowEngineTimeWindow', () => {
    it('should create from minutes', () => {
      var w = WorkflowEngineTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = WorkflowEngineTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = WorkflowEngineTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => WorkflowEngineTimeWindow.create(100, 0)).toThrow();
      expect(() => WorkflowEngineTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('WorkflowEnginePriority', () => {
    it('should create with valid value', () => {
      var p1 = WorkflowEnginePriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => WorkflowEnginePriority.create(15)).toThrow();
      expect(() => WorkflowEnginePriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(WorkflowEnginePriority.low().isLow()).toBe(true);
      expect(WorkflowEnginePriority.medium().isMedium()).toBe(true);
      expect(WorkflowEnginePriority.high().isHigh()).toBe(true);
      expect(WorkflowEnginePriority.critical().isCritical()).toBe(true);
    });
  });

  describe('WorkflowEngineExecuted Event', () => {
    it('should create event', () => {
      var ev = WorkflowEngineExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = WorkflowEngineExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('WorkflowEngineFailed Event', () => {
    it('should create failed event', () => {
      var ev = WorkflowEngineFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
